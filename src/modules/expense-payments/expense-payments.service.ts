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
import { PaymentMethod } from '../../common/enums/payment-method.enum';
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

      return await manager.save(payment);
    });
  }

  async delete(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const payment = await this.expensePaymentsRepository.findOne({
      where: { id, organization: { id: organizationId } },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.expensePaymentsRepository.remove(payment);
  }
}

