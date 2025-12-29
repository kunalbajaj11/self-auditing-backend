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
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { JournalEntryFilterDto } from './dto/journal-entry-filter.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../../common/enums/audit-action.enum';

@Injectable()
export class JournalEntriesService {
  constructor(
    @InjectRepository(JournalEntry)
    private readonly journalEntriesRepository: Repository<JournalEntry>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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
      .where('journalEntry.organization_id = :organizationId', { organizationId })
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

  async findById(
    organizationId: string,
    id: string,
  ): Promise<JournalEntry> {
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

    if (dto.debitAccount !== undefined) journalEntry.debitAccount = dto.debitAccount;
    if (dto.creditAccount !== undefined) journalEntry.creditAccount = dto.creditAccount;
    if (dto.amount !== undefined) journalEntry.amount = dto.amount.toFixed(2);
    if (dto.entryDate !== undefined) journalEntry.entryDate = dto.entryDate;
    if (dto.description !== undefined) journalEntry.description = dto.description;
    if (dto.referenceNumber !== undefined)
      journalEntry.referenceNumber = dto.referenceNumber;
    if (dto.customerVendorId !== undefined)
      journalEntry.customerVendorId = dto.customerVendorId;
    if (dto.customerVendorName !== undefined)
      journalEntry.customerVendorName = dto.customerVendorName;
    if (dto.vendorTrn !== undefined)
      journalEntry.vendorTrn = dto.vendorTrn;
    if (dto.vatAmount !== undefined)
      journalEntry.vatAmount = dto.vatAmount.toFixed(2);
    if (dto.vatTaxType !== undefined)
      journalEntry.vatTaxType = dto.vatTaxType;
    if (dto.subAccount !== undefined)
      journalEntry.subAccount = dto.subAccount;
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

