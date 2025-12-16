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

    if (filters.type) {
      query.andWhere('journalEntry.type = :type', { type: filters.type });
    }
    if (filters.category) {
      query.andWhere('journalEntry.category = :category', {
        category: filters.category,
      });
    }
    if (filters.status) {
      query.andWhere('journalEntry.status = :status', {
        status: filters.status,
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

    const journalEntry = this.journalEntriesRepository.create({
      organization: { id: organizationId },
      user: { id: userId },
      type: dto.type,
      category: dto.category,
      status: dto.status,
      amount: dto.amount.toFixed(2),
      entryDate: dto.entryDate,
      description: dto.description,
      referenceNumber: dto.referenceNumber,
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

    if (dto.type !== undefined) journalEntry.type = dto.type;
    if (dto.category !== undefined) journalEntry.category = dto.category;
    if (dto.status !== undefined) journalEntry.status = dto.status;
    if (dto.amount !== undefined) journalEntry.amount = dto.amount.toFixed(2);
    if (dto.entryDate !== undefined) journalEntry.entryDate = dto.entryDate;
    if (dto.description !== undefined) journalEntry.description = dto.description;
    if (dto.referenceNumber !== undefined)
      journalEntry.referenceNumber = dto.referenceNumber;
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

