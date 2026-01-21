import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerAccount } from '../../entities/ledger-account.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { CreateLedgerAccountDto } from './dto/create-ledger-account.dto';
import { UpdateLedgerAccountDto } from './dto/update-ledger-account.dto';

@Injectable()
export class LedgerAccountsService {
  constructor(
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountsRepository: Repository<LedgerAccount>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAllByOrganization(
    organizationId: string,
    userId: string,
  ): Promise<LedgerAccount[]> {
    const query = this.ledgerAccountsRepository
      .createQueryBuilder('ledgerAccount')
      .where('ledgerAccount.organization_id = :organizationId', { organizationId })
      .andWhere('ledgerAccount.is_deleted = false');

    // Scope custom ledger accounts to creator; always include system defaults
    query.andWhere(
      '(ledgerAccount.is_system_default = true OR ledgerAccount.created_by = :userId)',
      { userId },
    );

    return query.orderBy('ledgerAccount.category', 'ASC').addOrderBy('ledgerAccount.name', 'ASC').getMany();
  }

  async create(
    organizationId: string,
    createdById: string,
    dto: CreateLedgerAccountDto,
  ): Promise<LedgerAccount> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const createdBy = await this.usersRepository.findOne({
      where: { id: createdById },
    });
    if (!createdBy) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.ledgerAccountsRepository.findOne({
      where: {
        organization: { id: organizationId },
        name: dto.name,
      },
    });
    if (existing) {
      throw new ConflictException('Ledger account already exists');
    }

    const ledgerAccount = this.ledgerAccountsRepository.create({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      organization,
      createdBy,
    });
    return this.ledgerAccountsRepository.save(ledgerAccount);
  }

  async update(
    ledgerAccountId: string,
    organizationId: string,
    dto: UpdateLedgerAccountDto,
  ): Promise<LedgerAccount> {
    const ledgerAccount = await this.ledgerAccountsRepository.findOne({
      where: { id: ledgerAccountId, organization: { id: organizationId } },
    });
    if (!ledgerAccount) {
      throw new NotFoundException('Ledger account not found');
    }
    if (ledgerAccount.isSystemDefault) {
      throw new ConflictException('Cannot update system default ledger accounts');
    }
    if (dto.name && dto.name !== ledgerAccount.name) {
      const duplicate = await this.ledgerAccountsRepository.findOne({
        where: { organization: { id: organizationId }, name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException('Ledger account name already exists');
      }
      ledgerAccount.name = dto.name;
    }
    if (dto.description !== undefined) {
      ledgerAccount.description = dto.description;
    }
    if (dto.category !== undefined) {
      ledgerAccount.category = dto.category;
    }
    return this.ledgerAccountsRepository.save(ledgerAccount);
  }

  async remove(ledgerAccountId: string, organizationId: string): Promise<void> {
    const ledgerAccount = await this.ledgerAccountsRepository.findOne({
      where: { id: ledgerAccountId, organization: { id: organizationId } },
    });
    if (!ledgerAccount) {
      throw new NotFoundException('Ledger account not found');
    }
    if (ledgerAccount.isSystemDefault) {
      throw new ConflictException('Cannot delete system default ledger accounts');
    }
    ledgerAccount.isDeleted = true;
    ledgerAccount.deletedAt = new Date();
    await this.ledgerAccountsRepository.save(ledgerAccount);
  }
}

