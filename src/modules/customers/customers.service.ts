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
        '(customer.name ILIKE :search OR customer.display_name ILIKE :search OR customer.email ILIKE :search)',
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
    const customer = this.customersRepository.create({
      organization: { id: organizationId } as Organization,
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
