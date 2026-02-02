import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JournalEntry } from '../../entities/journal-entry.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { ExpensePayment } from '../../entities/expense-payment.entity';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { BulkCreateJournalEntryDto } from './dto/bulk-create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { JournalEntryFilterDto } from './dto/journal-entry-filter.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

@Injectable()
export class JournalEntriesService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly journalEntriesRepository: Repository<JournalEntry>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ExpensePayment)
    private readonly expensePaymentsRepository: Repository<ExpensePayment>,
    private readonly auditLogsService: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    organizationId: string,
    filters: JournalEntryFilterDto,
  ): Promise<JournalEntry[]> {
    const query = this.journalEntriesRepository
      .createQueryBuilder('journalEntry')
      .leftJoinAndSelect('journalEntry.user', 'user')
      .where('journalEntry.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('journalEntry.is_deleted = false');

    if (filters.debitAccount) {
      query.andWhere('journalEntry.debit_account = :debitAccount', {
        debitAccount: filters.debitAccount,
      });
    }
    if (filters.creditAccount) {
      query.andWhere('journalEntry.credit_account = :creditAccount', {
        creditAccount: filters.creditAccount,
      });
    }
    if (filters.startDate) {
      query.andWhere('journalEntry.entry_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('journalEntry.entry_date <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters.description) {
      query.andWhere('journalEntry.description ILIKE :description', {
        description: `%${filters.description}%`,
      });
    }
    if (filters.referenceNumber) {
      query.andWhere('journalEntry.reference_number ILIKE :referenceNumber', {
        referenceNumber: `%${filters.referenceNumber}%`,
      });
    }

    query.orderBy('journalEntry.entry_date', 'DESC');
    return query.getMany();
  }

  async findById(organizationId: string, id: string): Promise<JournalEntry> {
    const journalEntry = await this.journalEntriesRepository.findOne({
      where: { id, organization: { id: organizationId } },
      relations: ['user'],
    });

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found');
    }

    return journalEntry;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateJournalEntryDto,
  ): Promise<JournalEntry> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate: Debit and Credit accounts must be different
    if (dto.debitAccount === dto.creditAccount) {
      throw new BadRequestException(
        'Debit account and credit account cannot be the same',
      );
    }

    // Validate: Retained Earnings cannot be manually selected (system calculated)
    if (
      dto.debitAccount === 'retained_earnings' ||
      dto.creditAccount === 'retained_earnings'
    ) {
      throw new BadRequestException(
        'Retained Earnings is a system-calculated account and cannot be used in journal entries',
      );
    }

    // Validate custom ledger accounts exist (if using custom accounts)
    // This validation is optional but recommended for data integrity
    // We skip it if the account is a default enum value
    const debitIsCustom = dto.debitAccount.startsWith('ledger:');
    const creditIsCustom = dto.creditAccount.startsWith('ledger:');

    // Note: In a production system, you might want to validate that the custom ledger account
    // actually exists and belongs to the organization. For now, we'll let it pass and
    // handle any issues at display time.

    // Validate: Prevent duplicate cash payments via journal entries
    // If journal entry involves cash (credit or debit), check for existing cash payments
    const isCashJournalEntry =
      dto.creditAccount === 'cash' || dto.debitAccount === 'cash';

    if (isCashJournalEntry && dto.customerVendorName) {
      // Check if there's an existing cash payment for the same vendor on the same date
      const existingCashPayments = await this.expensePaymentsRepository
        .createQueryBuilder('payment')
        .leftJoin('payment.expense', 'expense')
        .where('payment.organization_id = :organizationId', { organizationId })
        .andWhere('payment.payment_method = :paymentMethod', {
          paymentMethod: PaymentMethod.CASH,
        })
        .andWhere('payment.is_deleted = false')
        .andWhere('payment.payment_date = :entryDate', {
          entryDate: dto.entryDate,
        })
        .andWhere(
          '(expense.vendor_name = :vendorName OR payment.notes LIKE :vendorNamePattern)',
          {
            vendorName: dto.customerVendorName,
            vendorNamePattern: `%${dto.customerVendorName}%`,
          },
        )
        .andWhere('ABS(CAST(payment.amount AS DECIMAL) - :amount) <= 0.01', {
          amount: dto.amount,
        })
        .getMany();

      if (existingCashPayments.length > 0) {
        throw new BadRequestException(
          `A cash payment already exists for vendor "${dto.customerVendorName}" on ${dto.entryDate} with amount ${dto.amount.toFixed(2)}. ` +
            'Creating a journal entry for cash would duplicate this payment. ' +
            'If you need to record this transaction, please delete the existing payment first or use a different account.',
        );
      }
    }

    const journalEntry = this.journalEntriesRepository.create({
      organization: { id: organizationId },
      user: { id: userId },
      debitAccount: dto.debitAccount,
      creditAccount: dto.creditAccount,
      amount: dto.amount.toFixed(2),
      entryDate: dto.entryDate,
      description: dto.description,
      referenceNumber: dto.referenceNumber,
      customerVendorId: dto.customerVendorId,
      customerVendorName: dto.customerVendorName,
      vendorTrn: dto.vendorTrn,
      vatAmount: dto.vatAmount ? dto.vatAmount.toFixed(2) : null,
      vatTaxType: dto.vatTaxType,
      subAccount: dto.subAccount,
      attachmentId: dto.attachmentId,
      notes: dto.notes,
    });

    const saved = await this.journalEntriesRepository.save(journalEntry);

    await this.auditLogsService.record({
      organizationId,
      userId,
      entityType: 'JournalEntry',
      entityId: saved.id,
      action: AuditAction.CREATE,
      changes: saved,
    });

    return saved;
  }

  /**
   * Bulk create journal entries (e.g. for opening balance migration from Tally/Zoho).
   * Runs in a transaction; fails entirely if any entry fails validation.
   */
  async bulkCreate(
    organizationId: string,
    userId: string,
    dto: BulkCreateJournalEntryDto,
  ): Promise<{ created: JournalEntry[]; errors?: string[] }> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const created: JournalEntry[] = [];
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const entryDto of dto.entries) {
        // Same validations as create()
        if (entryDto.debitAccount === entryDto.creditAccount) {
          await queryRunner.rollbackTransaction();
          throw new BadRequestException(
            `Debit and credit account cannot be the same: ${entryDto.debitAccount}`,
          );
        }
        if (
          entryDto.debitAccount === 'retained_earnings' ||
          entryDto.creditAccount === 'retained_earnings'
        ) {
          await queryRunner.rollbackTransaction();
          throw new BadRequestException(
            'Retained Earnings cannot be used in journal entries. Use Owner/Shareholder Account for opening balance equity.',
          );
        }

        const journalEntry = this.journalEntriesRepository.create({
          organization: { id: organizationId },
          user: { id: userId },
          debitAccount: entryDto.debitAccount,
          creditAccount: entryDto.creditAccount,
          amount: entryDto.amount.toFixed(2),
          entryDate: entryDto.entryDate,
          description: entryDto.description,
          referenceNumber: entryDto.referenceNumber,
          customerVendorId: entryDto.customerVendorId,
          customerVendorName: entryDto.customerVendorName,
          vendorTrn: entryDto.vendorTrn,
          vatAmount: entryDto.vatAmount ? entryDto.vatAmount.toFixed(2) : null,
          vatTaxType: entryDto.vatTaxType,
          subAccount: entryDto.subAccount,
          attachmentId: entryDto.attachmentId,
          notes: entryDto.notes,
        });

        const saved = await queryRunner.manager.save(JournalEntry, journalEntry);
        created.push(saved);

        await this.auditLogsService.record({
          organizationId,
          userId,
          entityType: 'JournalEntry',
          entityId: saved.id,
          action: AuditAction.CREATE,
          changes: saved,
        });
      }

      await queryRunner.commitTransaction();
      return { created };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateJournalEntryDto,
  ): Promise<JournalEntry> {
    const journalEntry = await this.findById(organizationId, id);

    // Validate: Debit and Credit accounts must be different
    const debitAccount = dto.debitAccount ?? journalEntry.debitAccount;
    const creditAccount = dto.creditAccount ?? journalEntry.creditAccount;

    if (debitAccount === creditAccount) {
      throw new BadRequestException(
        'Debit account and credit account cannot be the same',
      );
    }

    // Validate: Retained Earnings cannot be manually selected
    if (
      debitAccount === 'retained_earnings' ||
      creditAccount === 'retained_earnings'
    ) {
      throw new BadRequestException(
        'Retained Earnings is a system-calculated account and cannot be used in journal entries',
      );
    }

    if (dto.debitAccount !== undefined)
      journalEntry.debitAccount = dto.debitAccount;
    if (dto.creditAccount !== undefined)
      journalEntry.creditAccount = dto.creditAccount;
    if (dto.amount !== undefined) journalEntry.amount = dto.amount.toFixed(2);
    if (dto.entryDate !== undefined) journalEntry.entryDate = dto.entryDate;
    if (dto.description !== undefined)
      journalEntry.description = dto.description;
    if (dto.referenceNumber !== undefined)
      journalEntry.referenceNumber = dto.referenceNumber;
    if (dto.customerVendorId !== undefined)
      journalEntry.customerVendorId = dto.customerVendorId;
    if (dto.customerVendorName !== undefined)
      journalEntry.customerVendorName = dto.customerVendorName;
    if (dto.vendorTrn !== undefined) journalEntry.vendorTrn = dto.vendorTrn;
    if (dto.vatAmount !== undefined)
      journalEntry.vatAmount = dto.vatAmount.toFixed(2);
    if (dto.vatTaxType !== undefined) journalEntry.vatTaxType = dto.vatTaxType;
    if (dto.subAccount !== undefined) journalEntry.subAccount = dto.subAccount;
    if (dto.attachmentId !== undefined)
      journalEntry.attachmentId = dto.attachmentId;
    if (dto.notes !== undefined) journalEntry.notes = dto.notes;

    const updated = await this.journalEntriesRepository.save(journalEntry);

    await this.auditLogsService.record({
      organizationId,
      userId: journalEntry.user.id,
      entityType: 'JournalEntry',
      entityId: updated.id,
      action: AuditAction.UPDATE,
      changes: dto,
    });

    return updated;
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const journalEntry = await this.findById(organizationId, id);

    journalEntry.isDeleted = true;
    await this.journalEntriesRepository.save(journalEntry);

    await this.auditLogsService.record({
      organizationId,
      userId: journalEntry.user.id,
      entityType: 'JournalEntry',
      entityId: id,
      action: AuditAction.DELETE,
      changes: {},
    });
  }
}
