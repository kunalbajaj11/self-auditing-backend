import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { Expense } from '../../entities/expense.entity';
import { Organization } from '../../entities/organization.entity';
import { Accrual } from '../../entities/accrual.entity';
import { PaymentAllocation } from '../../entities/payment-allocation.entity';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { CreateExpensePaymentDto } from './dto/create-expense-payment.dto';

@Injectable()
export class ExpensePaymentsService {
  constructor(
    @InjectRepository(ExpensePayment)
    private readonly expensePaymentsRepository: Repository<ExpensePayment>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(PaymentAllocation)
    private readonly paymentAllocationsRepository: Repository<PaymentAllocation>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(organizationId: string): Promise<ExpensePayment[]> {
    const payments = await this.expensePaymentsRepository.find({
      where: { organization: { id: organizationId } },
      relations: ['expense'],
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });

    // Load allocations for each payment
    const paymentsWithAllocations = await Promise.all(
      payments.map(async (payment) => {
        const allocations = await this.paymentAllocationsRepository.find({
          where: { payment: { id: payment.id } },
          relations: ['expense'],
        });
        (payment as any).allocations = allocations;
        return payment;
      }),
    );

    return paymentsWithAllocations;
  }

  async findByExpense(
    organizationId: string,
    expenseId: string,
  ): Promise<ExpensePayment[]> {
    const payments = await this.expensePaymentsRepository.find({
      where: {
        expense: { id: expenseId },
        organization: { id: organizationId },
      },
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });

    // Load allocations for each payment
    const paymentsWithAllocations = await Promise.all(
      payments.map(async (payment) => {
        const allocations = await this.paymentAllocationsRepository.find({
          where: { payment: { id: payment.id } },
          relations: ['expense'],
        });
        (payment as any).allocations = allocations;
        return payment;
      }),
    );

    return paymentsWithAllocations;
  }

  async findById(organizationId: string, id: string): Promise<ExpensePayment> {
    const payment = await this.expensePaymentsRepository.findOne({
      where: { id, organization: { id: organizationId } },
      relations: ['expense'],
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Load allocations
    const allocations = await this.paymentAllocationsRepository.find({
      where: { payment: { id } },
      relations: ['expense'],
    });

    // Add allocations to payment object (as a property, not a relation)
    (payment as any).allocations = allocations;

    return payment;
  }

  async getPendingInvoicesByVendor(
    organizationId: string,
    vendorName: string,
  ): Promise<
    Array<Expense & { outstandingAmount: number; totalAmount: number }>
  > {
    // Find all expenses for this vendor
    const expenses = await this.expensesRepository.find({
      where: {
        organization: { id: organizationId },
        vendorName: vendorName,
        isDeleted: false,
      },
      order: { expenseDate: 'DESC' },
    });

    // Calculate outstanding amounts (considering both direct payments and allocations)
    const expensesWithOutstanding = await Promise.all(
      expenses.map(async (expense) => {
        // Get direct payments for this expense
        const directPayments = await this.expensePaymentsRepository.find({
          where: {
            expense: { id: expense.id },
            organization: { id: organizationId },
          },
        });

        // Get allocations for this expense (from multi-invoice payments)
        const allocations = await this.paymentAllocationsRepository.find({
          where: {
            expense: { id: expense.id },
          },
          relations: ['payment'],
        });

        // Filter allocations to only those from payments in this organization
        const validAllocations = allocations.filter((alloc) => {
          return (
            alloc.payment &&
            (alloc.payment as any).organization?.id === organizationId
          );
        });

        const totalAmountNum = parseFloat(expense.totalAmount || '0');

        // Calculate paid amount from direct payments
        const directPaidAmount = directPayments.reduce(
          (sum, p) => sum + parseFloat(p.amount),
          0,
        );

        // Calculate allocated amount from multi-invoice payments
        const allocatedAmount = validAllocations.reduce(
          (sum, alloc) => sum + parseFloat(alloc.allocatedAmount),
          0,
        );

        // Total paid = direct payments + allocations
        const totalPaid = directPaidAmount + allocatedAmount;
        const outstandingAmount = Math.max(0, totalAmountNum - totalPaid);

        return {
          ...expense,
          totalAmount: totalAmountNum, // Return as number for API response
          outstandingAmount,
        } as Expense & { outstandingAmount: number; totalAmount: number };
      }),
    );

    // Filter to only include expenses with outstanding balance > 0.01
    return expensesWithOutstanding.filter(
      (exp) => exp.outstandingAmount > 0.01,
    );
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateExpensePaymentDto,
  ): Promise<ExpensePayment> {
    return await this.dataSource.transaction(async (manager) => {
      const paymentAmount = parseFloat(dto.amount.toString());

      if (paymentAmount <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
      }

      // Support both legacy single-expense payment and new multi-invoice allocation
      if (dto.allocations && dto.allocations.length > 0) {
        // New: Multi-invoice allocation mode
        return this.createMultiInvoicePayment(
          manager,
          organizationId,
          dto,
          paymentAmount,
        );
      } else if (dto.expenseId) {
        // Legacy: Single expense payment (backward compatibility)
        return this.createSingleExpensePayment(
          manager,
          organizationId,
          dto,
          paymentAmount,
        );
      } else {
        throw new BadRequestException(
          'Either expenseId or allocations must be provided',
        );
      }
    });
  }

  private async createMultiInvoicePayment(
    manager: any,
    organizationId: string,
    dto: CreateExpensePaymentDto,
    paymentAmount: number,
  ): Promise<ExpensePayment> {
    // Validate allocations
    const totalAllocated = dto.allocations!.reduce(
      (sum, alloc) => sum + alloc.allocatedAmount,
      0,
    );

    // Allow small tolerance for rounding (0.01)
    if (Math.abs(totalAllocated - paymentAmount) > 0.01) {
      throw new BadRequestException(
        `Total allocated amount (${totalAllocated.toFixed(2)}) must equal payment amount (${paymentAmount.toFixed(2)})`,
      );
    }

    // Validate each allocation
    const expenseIds = dto.allocations!.map((a) => a.expenseId);
    const expenses = await manager.find(Expense, {
      where: expenseIds.map((id) => ({
        id,
        organization: { id: organizationId },
      })),
    });

    if (expenses.length !== expenseIds.length) {
      throw new NotFoundException('One or more expenses not found');
    }

    // Validate allocations don't exceed outstanding balances
    for (const allocation of dto.allocations!) {
      const expense = expenses.find((e) => e.id === allocation.expenseId);
      if (!expense) continue;

      const totalAmount = parseFloat(expense.totalAmount || '0');

      // Get direct payments for this expense
      const existingPayments = await manager.find(ExpensePayment, {
        where: {
          expense: { id: allocation.expenseId },
          organization: { id: organizationId },
        },
      });

      // Get existing allocations for this expense
      const existingAllocations = await manager.find(PaymentAllocation, {
        where: { expense: { id: allocation.expenseId } },
        relations: ['payment'],
      });

      // Filter allocations to only those from payments in this organization
      const validAllocations = existingAllocations.filter((alloc) => {
        return (
          alloc.payment &&
          (alloc.payment as any).organization?.id === organizationId
        );
      });

      const directPaidAmount = existingPayments.reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0,
      );

      const allocatedAmount = validAllocations.reduce(
        (sum, alloc) => sum + parseFloat(alloc.allocatedAmount),
        0,
      );

      const totalPaid = directPaidAmount + allocatedAmount;
      const outstandingBalance = totalAmount - totalPaid;

      if (allocation.allocatedAmount > outstandingBalance + 0.01) {
        throw new BadRequestException(
          `Allocation amount (${allocation.allocatedAmount.toFixed(2)}) for expense ${expense.invoiceNumber || expense.id} exceeds outstanding balance (${outstandingBalance.toFixed(2)})`,
        );
      }
    }

    // Create payment record (use first expense for backward compatibility with existing code)
    const firstExpense = expenses[0];
    const payment = manager.create(ExpensePayment, {
      expense: { id: firstExpense.id },
      organization: { id: organizationId },
      paymentDate: dto.paymentDate,
      amount: paymentAmount.toString(),
      paymentMethod: dto.paymentMethod || PaymentMethod.OTHER,
      referenceNumber: dto.referenceNumber,
      notes: dto.notes,
      isDeleted: false, // Explicitly set to ensure it's not filtered out
    });

    const savedPayment = await manager.save(payment);

    // Create allocations
    for (const allocation of dto.allocations!) {
      const allocationEntity = manager.create(PaymentAllocation, {
        payment: { id: savedPayment.id },
        expense: { id: allocation.expenseId },
        allocatedAmount: allocation.allocatedAmount.toFixed(2),
      });
      await manager.save(allocationEntity);

      // Update accrual status if applicable
      await this.updateAccrualStatusForExpense(
        manager,
        organizationId,
        allocation.expenseId,
        dto.paymentDate,
      );
    }

    return savedPayment;
  }

  private async createSingleExpensePayment(
    manager: any,
    organizationId: string,
    dto: CreateExpensePaymentDto,
    paymentAmount: number,
  ): Promise<ExpensePayment> {
    const expense = await manager.findOne(Expense, {
      where: { id: dto.expenseId, organization: { id: organizationId } },
      relations: ['payments'],
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    const totalAmount = parseFloat(expense.totalAmount || '0');

    // Get direct payments for this expense
    const existingPayments = await manager.find(ExpensePayment, {
      where: {
        expense: { id: dto.expenseId },
        organization: { id: organizationId },
      },
    });

    // Get existing allocations for this expense
    const existingAllocations = await manager.find(PaymentAllocation, {
      where: { expense: { id: dto.expenseId } },
      relations: ['payment'],
    });

    // Filter allocations to only those from payments in this organization
    const validAllocations = existingAllocations.filter((alloc) => {
      return (
        alloc.payment &&
        (alloc.payment as any).organization?.id === organizationId
      );
    });

    const directPaidAmount = existingPayments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0,
    );

    const allocatedAmount = validAllocations.reduce(
      (sum, alloc) => sum + parseFloat(alloc.allocatedAmount),
      0,
    );

    const totalPaid = directPaidAmount + allocatedAmount;
    const outstandingBalance = totalAmount - totalPaid;

    if (paymentAmount > outstandingBalance + 0.01) {
      throw new BadRequestException(
        `Payment amount (${paymentAmount.toFixed(2)}) exceeds outstanding balance (${outstandingBalance.toFixed(2)})`,
      );
    }

    // Create payment record
    const payment = manager.create(ExpensePayment, {
      expense: { id: dto.expenseId },
      organization: { id: organizationId },
      paymentDate: dto.paymentDate,
      amount: paymentAmount.toString(),
      paymentMethod: dto.paymentMethod || PaymentMethod.OTHER,
      referenceNumber: dto.referenceNumber,
      notes: dto.notes,
      isDeleted: false, // Explicitly set to ensure it's not filtered out
    });

    const savedPayment = await manager.save(payment);

    // Create allocation for single expense (for consistency)
    const allocation = manager.create(PaymentAllocation, {
      payment: { id: savedPayment.id },
      expense: { id: dto.expenseId },
      allocatedAmount: paymentAmount.toFixed(2),
    });
    await manager.save(allocation);

    // Update accrual status if applicable
    await this.updateAccrualStatusForExpense(
      manager,
      organizationId,
      dto.expenseId,
      dto.paymentDate,
    );

    return savedPayment;
  }

  private async updateAccrualStatusForExpense(
    manager: any,
    organizationId: string,
    expenseId: string,
    paymentDate: string,
  ): Promise<void> {
    const expenseWithAccrual = await manager.findOne(Expense, {
      where: { id: expenseId, organization: { id: organizationId } },
      relations: ['linkedAccrual'],
    });

    if (expenseWithAccrual?.linkedAccrual) {
      const accrual = await manager.findOne(Accrual, {
        where: {
          expense: { id: expenseWithAccrual.linkedAccrual.id },
          organization: { id: organizationId },
        },
      });

      if (accrual && accrual.status === AccrualStatus.PENDING_SETTLEMENT) {
        // Get direct payments
        const allPayments = await manager.find(ExpensePayment, {
          where: {
            expense: { id: expenseId },
            organization: { id: organizationId },
          },
        });

        // Get allocations
        const allAllocations = await manager.find(PaymentAllocation, {
          where: { expense: { id: expenseId } },
          relations: ['payment'],
        });

        // Filter allocations to only those from payments in this organization
        const validAllocations = allAllocations.filter((alloc) => {
          return (
            alloc.payment &&
            (alloc.payment as any).organization?.id === organizationId
          );
        });

        const directPaid = allPayments.reduce(
          (sum, p) => sum + parseFloat(p.amount),
          0,
        );

        const allocatedPaid = validAllocations.reduce(
          (sum, alloc) => sum + parseFloat(alloc.allocatedAmount),
          0,
        );

        const totalPaid = directPaid + allocatedPaid;
        const expenseTotal = parseFloat(expenseWithAccrual.totalAmount || '0');

        if (totalPaid >= expenseTotal - 0.01) {
          accrual.status = AccrualStatus.SETTLED;
          accrual.settlementDate = paymentDate;
          accrual.settlementExpense = expenseWithAccrual;
          await manager.save(accrual);
        }
      }
    }
  }

  async delete(organizationId: string, id: string): Promise<void> {
    return await this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(ExpensePayment, {
        where: { id, organization: { id: organizationId } },
        relations: ['expense'],
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const expenseId = payment.expense.id;

      // Get all allocations for this payment before deletion
      const allocations = await manager.find(PaymentAllocation, {
        where: { payment: { id } },
        relations: ['expense'],
      });

      // Delete allocations first (CASCADE should handle this, but being explicit)
      if (allocations.length > 0) {
        await manager.remove(allocations);
      }

      // Delete the payment
      await manager.remove(payment);

      // Update accrual status for all affected expenses (from allocations)
      const affectedExpenseIds = new Set<string>([expenseId]);
      allocations.forEach((alloc) => {
        if (alloc.expense?.id) {
          affectedExpenseIds.add(alloc.expense.id);
        }
      });

      // Check if any affected expense is linked to an accrual
      for (const affectedExpenseId of affectedExpenseIds) {
        const expense = await manager.findOne(Expense, {
          where: {
            id: affectedExpenseId,
            organization: { id: organizationId },
          },
          relations: ['linkedAccrual'],
        });

        if (expense?.linkedAccrual) {
          // This expense is settling an accrual - find the accrual record
          const accrual = await manager.findOne(Accrual, {
            where: {
              expense: { id: expense.linkedAccrual.id },
              organization: { id: organizationId },
            },
          });

          if (accrual && accrual.status === AccrualStatus.SETTLED) {
            // Recalculate total paid amount after payment deletion
            // Consider both direct payments and allocations
            const remainingPayments = await manager.find(ExpensePayment, {
              where: {
                expense: { id: affectedExpenseId },
                organization: { id: organizationId },
              },
            });

            const remainingAllocations = await manager.find(PaymentAllocation, {
              where: { expense: { id: affectedExpenseId } },
              relations: ['payment'],
            });

            // Filter allocations to only those from payments in this organization
            const validAllocations = remainingAllocations.filter((alloc) => {
              return (
                alloc.payment &&
                (alloc.payment as any).organization?.id === organizationId
              );
            });

            const directPaid = remainingPayments.reduce(
              (sum, p) => sum + parseFloat(p.amount),
              0,
            );

            const allocatedPaid = validAllocations.reduce(
              (sum, alloc) => sum + parseFloat(alloc.allocatedAmount),
              0,
            );

            const totalPaid = directPaid + allocatedPaid;
            const expenseTotal = parseFloat(expense.totalAmount || '0');

            // If no longer fully paid, revert accrual status to pending
            if (totalPaid < expenseTotal - 0.01) {
              accrual.status = AccrualStatus.PENDING_SETTLEMENT;
              accrual.settlementDate = null;
              accrual.settlementExpense = null;
              await manager.save(accrual);
            }
          }
        }
      }
    });
  }
}
