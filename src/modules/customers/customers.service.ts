import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Customer } from './customer.entity';
import { Organization } from '../../entities/organization.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFilterDto } from './dto/customer-filter.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
  ) {}

  /**
   * Generate next customer number for the organization: C + YYYYMMDD + sequence (e.g. C2026021301, C20260213100).
   * Orders by numeric suffix so 99, 100, 101 are correct.
   */
  private async generateNextCustomerNumber(
    organizationId: string,
  ): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `C${yyyy}${mm}${dd}`;

    const rows = await this.customersRepository
      .createQueryBuilder('c')
      .select('c.customer_number')
      .addSelect(
        'CAST(SUBSTRING(c.customer_number FROM 10) AS INTEGER)',
        'seq',
      )
      .where('c.organization_id = :organizationId', { organizationId })
      .andWhere('c.customer_number LIKE :prefix', {
        prefix: `${datePrefix}%`,
      })
      .orderBy('seq', 'DESC')
      .limit(1)
      .getRawOne<{ customer_number: string; seq: string }>();

    const suffix = rows?.customer_number?.slice(9) ?? '';
    const nextSeq = suffix ? parseInt(suffix, 10) + 1 : 1;
    const seqStr =
      nextSeq >= 100
        ? String(nextSeq)
        : String(nextSeq).padStart(2, '0');
    return `${datePrefix}${seqStr}`;
  }

  async findAll(
    organizationId: string,
    filters?: CustomerFilterDto,
  ): Promise<Customer[]> {
    const query = this.customersRepository
      .createQueryBuilder('customer')
      .where('customer.organization_id = :organizationId', { organizationId })
      .andWhere('customer.is_deleted = false');

    if (filters?.search) {
      query.andWhere(
        '(customer.name ILIKE :search OR customer.display_name ILIKE :search OR customer.email ILIKE :search OR customer.customer_number ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters?.isActive !== undefined) {
      query.andWhere('customer.is_active = :isActive', {
        isActive: filters.isActive,
      });
    }

    query.orderBy('customer.name', 'ASC');

    return query.getMany();
  }

  async findById(organizationId: string, id: string): Promise<Customer> {
    const customer = await this.customersRepository.findOne({
      where: { id, organization: { id: organizationId } },
      relations: ['organization'],
    });

    if (!customer || customer.isDeleted) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async search(organizationId: string, query: string): Promise<Customer[]> {
    return this.customersRepository.find({
      where: {
        organization: { id: organizationId },
        name: ILike(`%${query}%`),
        isActive: true,
        isDeleted: false,
      },
      take: 10,
      order: { lastUsedAt: 'DESC', name: 'ASC' },
    });
  }

  async create(
    organizationId: string,
    dto: CreateCustomerDto,
  ): Promise<Customer> {
    const customerNumber =
      dto.customerNumber ?? (await this.generateNextCustomerNumber(organizationId));

    const customer = this.customersRepository.create({
      organization: { id: organizationId } as Organization,
      customerNumber,
      name: dto.name,
      displayName: dto.displayName,
      customerTrn: dto.customerTrn,
      address: dto.address,
      city: dto.city,
      country: dto.country,
      phone: dto.phone,
      email: dto.email,
      contactPerson: dto.contactPerson,
      preferredCurrency: dto.preferredCurrency || 'AED',
      paymentTerms: dto.paymentTerms,
      notes: dto.notes,
      firstUsedAt: new Date(),
      lastUsedAt: new Date(),
      isActive: dto.isActive ?? true,
    });

    return this.customersRepository.save(customer);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.findById(organizationId, id);

    Object.assign(customer, {
      ...dto,
      lastUsedAt: new Date(),
    });

    return this.customersRepository.save(customer);
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const customer = await this.findById(organizationId, id);

    // Soft delete
    customer.isDeleted = true;
    customer.isActive = false;
    await this.customersRepository.save(customer);
  }
}
