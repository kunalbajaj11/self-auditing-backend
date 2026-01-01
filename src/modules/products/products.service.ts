import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { Organization } from '../../entities/organization.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  async create(
    organizationId: string,
    data: {
      name: string;
      sku?: string;
      description?: string;
      unitPrice?: number;
      unitOfMeasure?: string;
      vatRate?: number;
    },
  ): Promise<Product> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const product = this.productsRepository.create({
      organization: { id: organizationId },
      name: data.name,
      sku: data.sku,
      description: data.description,
      unitPrice: data.unitPrice?.toString(),
      unitOfMeasure: data.unitOfMeasure || 'unit',
      vatRate: data.vatRate?.toString() || '5.00',
      isActive: true,
      stockQuantity: '0',
    });

    return this.productsRepository.save(product);
  }

  async findAll(organizationId: string): Promise<Product[]> {
    return this.productsRepository.find({
      where: {
        organization: { id: organizationId },
        isDeleted: false,
      },
      order: { name: 'ASC' },
    });
  }

  async findById(organizationId: string, id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
        isDeleted: false,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(
    organizationId: string,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const product = await this.findById(organizationId, id);
    Object.assign(product, data);
    return this.productsRepository.save(product);
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const product = await this.findById(organizationId, id);
    product.isDeleted = true;
    await this.productsRepository.save(product);
  }
}
