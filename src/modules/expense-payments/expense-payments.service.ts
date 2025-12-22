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
    private readonly dataSource: DataSource,
  ) {}

  async findAll(organizationId: string): Promise<ExpensePayment[]> {
    return this.expensePaymentsRepository.find({
      where: { organization: { id: organizationId } },
      relations: ['expense'],
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findByExpense(
    organizationId: string,
    expenseId: string,
  ): Promise<ExpensePayment[]> {
    return this.expensePaymentsRepository.find({
      where: {
        expense: { id: expenseId },
        organization: { id: organizationId },
      },
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<ExpensePayment> {
    const payment = await this.expensePaymentsRepository.findOne({
      where: { id, organization: { id: organizationId } },
      relations: ['expense'],
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateExpensePaymentDto,
  ): Promise<ExpensePayment> {
    return await this.dataSource.transaction(async (manager) => {
      const expense = await manager.findOne(Expense, {
        where: { id: dto.expenseId, organization: { id: organizationId } },
        relations: ['payments'],
      });

      if (!expense) {
        throw new NotFoundException('Expense not found');
      }

      const paymentAmount = parseFloat(dto.amount.toString());
      const totalAmount = parseFloat(expense.totalAmount || '0');

      // Calculate total paid amount
      const existingPayments = await manager.find(ExpensePayment, {
        where: {
          expense: { id: dto.expenseId },
          organization: { id: organizationId },
        },
      });

      const paidAmount = existingPayments.reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0,
      );

      const outstandingBalance = totalAmount - paidAmount;

      if (paymentAmount > outstandingBalance) {
        throw new BadRequestException(
          `Payment amount (${paymentAmount}) exceeds outstanding balance (${outstandingBalance.toFixed(2)})`,
        );
      }

      if (paymentAmount <= 0) {
        throw new BadRequestException('Payment amount must be greater than 0');
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
      });

      const savedPayment = await manager.save(payment);

      // Check if expense is linked to an accrual and update accrual status if fully paid
      // Load expense with linkedAccrual relation to check if it's settling an accrual
      const expenseWithAccrual = await manager.findOne(Expense, {
        where: { id: dto.expenseId, organization: { id: organizationId } },
        relations: ['linkedAccrual'],
      });

      if (expenseWithAccrual?.linkedAccrual) {
        // This expense is settling an accrual - find the accrual record
        const accrual = await manager.findOne(Accrual, {
          where: {
            expense: { id: expenseWithAccrual.linkedAccrual.id },
            organization: { id: organizationId },
          },
        });

        if (accrual && accrual.status === AccrualStatus.PENDING_SETTLEMENT) {
          // Calculate total paid amount including the new payment
          const allPayments = await manager.find(ExpensePayment, {
            where: {
              expense: { id: dto.expenseId },
              organization: { id: organizationId },
            },
          });

          const totalPaid = allPayments.reduce(
            (sum, p) => sum + parseFloat(p.amount),
            0,
          );

          const expenseTotal = parseFloat(expenseWithAccrual.totalAmount || '0');

          // If fully paid (within small tolerance for rounding), mark accrual as settled
          if (totalPaid >= expenseTotal - 0.01) {
            accrual.status = AccrualStatus.SETTLED;
            accrual.settlementDate = dto.paymentDate;
            accrual.settlementExpense = expenseWithAccrual;
            await manager.save(accrual);
          }
        }
      }

      return savedPayment;
    });
  }

  async delete(
    organizationId: string,
    id: string,
  ): Promise<void> {
    return await this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(ExpensePayment, {
        where: { id, organization: { id: organizationId } },
        relations: ['expense'],
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const expenseId = payment.expense.id;

      // Delete the payment
      await manager.remove(payment);

      // Check if expense is linked to an accrual and update accrual status if no longer fully paid
      const expense = await manager.findOne(Expense, {
        where: { id: expenseId, organization: { id: organizationId } },
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
          const remainingPayments = await manager.find(ExpensePayment, {
            where: {
              expense: { id: expenseId },
              organization: { id: organizationId },
            },
          });

          const totalPaid = remainingPayments.reduce(
            (sum, p) => sum + parseFloat(p.amount),
            0,
          );

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
    });
  }
}

