import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryLocation } from './entities/inventory-location.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { StockAdjustment } from './entities/stock-adjustment.entity';
import { StockAdjustmentItem } from './entities/stock-adjustment-item.entity';
import { Product } from '../products/product.entity';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { StockMovementType } from '../../common/enums/stock-movement-type.enum';
import { StockAdjustmentStatus } from '../../common/enums/stock-adjustment-status.enum';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryLocation)
    private readonly locationsRepository: Repository<InventoryLocation>,
    @InjectRepository(StockMovement)
    private readonly movementsRepository: Repository<StockMovement>,
    @InjectRepository(StockAdjustment)
    private readonly adjustmentsRepository: Repository<StockAdjustment>,
    @InjectRepository(StockAdjustmentItem)
    private readonly adjustmentItemsRepository: Repository<StockAdjustmentItem>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Location methods
  async createLocation(
    organizationId: string,
    name: string,
    address?: string,
  ): Promise<InventoryLocation> {
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const location = this.locationsRepository.create({
      organization: { id: organizationId },
      name,
      address,
      isActive: true,
      isDefault: false,
    });

    return this.locationsRepository.save(location);
  }

  async findAllLocations(organizationId: string): Promise<InventoryLocation[]> {
    return this.locationsRepository.find({
      where: {
        organization: { id: organizationId },
        isDeleted: false,
      },
      order: { name: 'ASC' },
    });
  }

  async findLocationById(
    organizationId: string,
    id: string,
  ): Promise<InventoryLocation> {
    const location = await this.locationsRepository.findOne({
      where: {
        id,
        organization: { id: organizationId },
        isDeleted: false,
      },
    });

    if (!location) {
      throw new NotFoundException('Inventory location not found');
    }

    return location;
  }

  async updateLocation(
    organizationId: string,
    id: string,
    updates: { name?: string; address?: string },
  ): Promise<InventoryLocation> {
    const location = await this.findLocationById(organizationId, id);
    
    if (updates.name !== undefined) {
      location.name = updates.name;
    }
    if (updates.address !== undefined) {
      location.address = updates.address;
    }
    
    return this.locationsRepository.save(location);
  }

  // Stock methods
  async getStockQuantity(
    organizationId: string,
    productId: string,
    locationId?: string,
  ): Promise<{
    product: Product;
    quantity: string;
    location?: InventoryLocation;
  }> {
    const product = await this.productsRepository.findOne({
      where: {
        id: productId,
        organization: { id: organizationId },
        isDeleted: false,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let location: InventoryLocation | undefined;
    if (locationId) {
      location = await this.findLocationById(organizationId, locationId);
    }

    // Calculate stock from movements
    const query = this.movementsRepository
      .createQueryBuilder('movement')
      .select('COALESCE(SUM(CAST(movement.quantity AS DECIMAL)), 0)', 'total')
      .where('movement.product_id = :productId', { productId })
      .andWhere('movement.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('movement.is_deleted = false');

    if (locationId) {
      query.andWhere('movement.location_id = :locationId', { locationId });
    }

    const result = await query.getRawOne();
    const quantity = result?.total || '0';

    return {
      product,
      quantity,
      location,
    };
  }

  // Record stock movement and update product stock
  async recordStockMovement(
    organizationId: string,
    userId: string,
    dto: CreateStockMovementDto,
  ): Promise<StockMovement> {
    // Validate product
    const product = await this.productsRepository.findOne({
      where: {
        id: dto.productId,
        organization: { id: organizationId },
        isDeleted: false,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Validate location
    const location = await this.findLocationById(
      organizationId,
      dto.locationId,
    );

    // Check stock availability for sales
    // For sales, quantity is negative, so we check the absolute value
    if (dto.movementType === StockMovementType.SALE) {
      const quantityToDeduct = Math.abs(dto.quantity);
      const currentStock = await this.getStockQuantity(
        organizationId,
        dto.productId,
        dto.locationId,
      );
      const availableStock = parseFloat(currentStock.quantity);
      if (availableStock < quantityToDeduct) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${availableStock}, Requested: ${quantityToDeduct}`,
        );
      }
    }

    // Create movement record
    const movement = this.movementsRepository.create({
      organization: { id: organizationId },
      product: { id: dto.productId },
      location: { id: dto.locationId },
      movementType: dto.movementType,
      quantity: dto.quantity.toString(),
      unitCost: dto.unitCost.toString(),
      totalCost: (Math.abs(dto.quantity) * dto.unitCost).toString(),
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      notes: dto.notes,
      createdBy: { id: userId },
    });

    const savedMovement = await this.movementsRepository.save(movement);

    // Update product stock quantity
    await this.updateProductStock(
      organizationId,
      dto.productId,
      dto.locationId,
    );

    return savedMovement;
  }

  // Update product stock quantity from movements
  private async updateProductStock(
    organizationId: string,
    productId: string,
    locationId?: string,
  ): Promise<void> {
    const query = this.movementsRepository
      .createQueryBuilder('movement')
      .select('COALESCE(SUM(CAST(movement.quantity AS DECIMAL)), 0)', 'total')
      .where('movement.product_id = :productId', { productId })
      .andWhere('movement.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('movement.is_deleted = false');

    if (locationId) {
      query.andWhere('movement.location_id = :locationId', { locationId });
    }

    const result = await query.getRawOne();
    const totalQuantity = Math.max(0, parseFloat(result?.total || '0'));

    // Update product stock quantity
    await this.productsRepository.update(
      { id: productId },
      { stockQuantity: totalQuantity.toString() },
    );
  }

  // Get stock movements
  async getStockMovements(
    organizationId: string,
    filters: {
      productId?: string;
      locationId?: string;
      movementType?: StockMovementType;
      limit?: number;
    } = {},
  ): Promise<StockMovement[]> {
    const query = this.movementsRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('movement.location', 'location')
      .leftJoinAndSelect('movement.createdBy', 'createdBy')
      .where('movement.organization_id = :organizationId', { organizationId })
      .andWhere('movement.is_deleted = false');

    if (filters.productId) {
      query.andWhere('movement.product_id = :productId', {
        productId: filters.productId,
      });
    }

    if (filters.locationId) {
      query.andWhere('movement.location_id = :locationId', {
        locationId: filters.locationId,
      });
    }

    if (filters.movementType) {
      query.andWhere('movement.movement_type = :movementType', {
        movementType: filters.movementType,
      });
    }

    query.orderBy('movement.created_at', 'DESC');

    if (filters.limit) {
      query.limit(filters.limit);
    }

    return query.getMany();
  }

  // Stock Adjustments
  async createStockAdjustment(
    organizationId: string,
    userId: string,
    dto: CreateStockAdjustmentDto,
  ): Promise<StockAdjustment> {
    const location = await this.findLocationById(
      organizationId,
      dto.locationId,
    );

    const adjustment = this.adjustmentsRepository.create({
      organization: { id: organizationId },
      location: { id: dto.locationId },
      adjustmentDate: dto.adjustmentDate,
      reason: dto.reason,
      notes: dto.notes,
      status: StockAdjustmentStatus.DRAFT,
      createdBy: { id: userId },
    });

    const savedAdjustment = await this.adjustmentsRepository.save(adjustment);

    // Create adjustment items
    const adjustmentItems: StockAdjustmentItem[] = [];
    for (const itemDto of dto.items) {
      const product = await this.productsRepository.findOne({
        where: {
          id: itemDto.productId,
          organization: { id: organizationId },
          isDeleted: false,
        },
      });

      if (!product) {
        throw new NotFoundException(`Product ${itemDto.productId} not found`);
      }

      const currentStock = await this.getStockQuantity(
        organizationId,
        itemDto.productId,
        dto.locationId,
      );
      const quantityBefore = parseFloat(currentStock.quantity);
      const quantityAfter = parseFloat(itemDto.quantityAfter);
      const quantityChange = quantityAfter - quantityBefore;

      const unitCost = product.costPrice
        ? parseFloat(product.costPrice)
        : product.averageCost
          ? parseFloat(product.averageCost)
          : 0;

      const adjustmentItem = this.adjustmentItemsRepository.create({
        adjustment: savedAdjustment,
        product: { id: itemDto.productId },
        quantityBefore: quantityBefore.toString(),
        quantityAfter: quantityAfter.toString(),
        quantityChange: quantityChange.toString(),
        unitCost: unitCost.toString(),
        totalCost: (Math.abs(quantityChange) * unitCost).toString(),
      });

      const savedItem =
        await this.adjustmentItemsRepository.save(adjustmentItem);
      adjustmentItems.push(savedItem);
    }

    savedAdjustment.adjustmentItems = adjustmentItems;
    return savedAdjustment;
  }

  async processStockAdjustment(
    organizationId: string,
    adjustmentId: string,
    userId: string,
  ): Promise<StockAdjustment> {
    const adjustment = await this.adjustmentsRepository.findOne({
      where: {
        id: adjustmentId,
        organization: { id: organizationId },
        isDeleted: false,
      },
      relations: ['adjustmentItems', 'adjustmentItems.product', 'location'],
    });

    if (!adjustment) {
      throw new NotFoundException('Stock adjustment not found');
    }

    if (adjustment.status !== StockAdjustmentStatus.DRAFT) {
      throw new BadRequestException('Only draft adjustments can be processed');
    }

    // Process each adjustment item
    for (const item of adjustment.adjustmentItems) {
      const quantityChange = parseFloat(item.quantityChange);

      if (quantityChange !== 0) {
        // Record stock movement
        await this.recordStockMovement(organizationId, userId, {
          productId: item.product.id,
          locationId: adjustment.location.id,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: quantityChange,
          unitCost: parseFloat(item.unitCost),
          referenceType: 'stock_adjustment',
          referenceId: adjustment.id,
          notes: `Adjustment: ${adjustment.reason}`,
        });
      }
    }

    // Update adjustment status
    adjustment.status = StockAdjustmentStatus.PROCESSED;
    adjustment.approvedBy = { id: userId } as User;

    return this.adjustmentsRepository.save(adjustment);
  }

  async getStockAdjustments(
    organizationId: string,
    filters: {
      locationId?: string;
      status?: StockAdjustmentStatus;
    } = {},
  ): Promise<StockAdjustment[]> {
    const query = this.adjustmentsRepository
      .createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.location', 'location')
      .leftJoinAndSelect('adjustment.createdBy', 'createdBy')
      .leftJoinAndSelect('adjustment.approvedBy', 'approvedBy')
      .leftJoinAndSelect('adjustment.adjustmentItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .where('adjustment.organization_id = :organizationId', { organizationId })
      .andWhere('adjustment.is_deleted = false');

    if (filters.locationId) {
      query.andWhere('adjustment.location_id = :locationId', {
        locationId: filters.locationId,
      });
    }

    if (filters.status) {
      query.andWhere('adjustment.status = :status', { status: filters.status });
    }

    query.orderBy('adjustment.adjustment_date', 'DESC');
    query.addOrderBy('adjustment.created_at', 'DESC');

    return query.getMany();
  }

  // TODO: Implement stock valuation (FIFO/LIFO/Average) - for future enhancement
}
