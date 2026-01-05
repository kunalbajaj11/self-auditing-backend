import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PlanTypeGuard } from '../../common/guards/plan-type.guard';
import { LicenseFeatureGuard } from '../../common/guards/license-feature.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PlanTypes } from '../../common/decorators/plan-types.decorator';
import { RequireLicenseFeature } from '../../common/decorators/license-feature.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { PlanType } from '../../common/enums/plan-type.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { StockMovementType } from '../../common/enums/stock-movement-type.enum';
import { StockAdjustmentStatus } from '../../common/enums/stock-adjustment-status.enum';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, LicenseFeatureGuard)
@RequireLicenseFeature('inventory') // Requires inventory feature to be enabled in license
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Location endpoints
  @Post('locations')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async createLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { name: string; address?: string },
  ) {
    return this.inventoryService.createLocation(
      user?.organizationId as string,
      body.name,
      body.address,
    );
  }

  @Get('locations')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async listLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.findAllLocations(
      user?.organizationId as string,
    );
  }

  @Get('locations/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async getLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inventoryService.findLocationById(
      user?.organizationId as string,
      id,
    );
  }

  @Patch('locations/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { name?: string; address?: string },
  ) {
    return this.inventoryService.updateLocation(
      user?.organizationId as string,
      id,
      body,
    );
  }

  // Stock endpoints
  @Get('products/:productId/stock')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async getStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.inventoryService.getStockQuantity(
      user?.organizationId as string,
      productId,
      locationId,
    );
  }

  // Stock Movement endpoints
  @Post('movements')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async recordMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockMovementDto,
  ) {
    return this.inventoryService.recordStockMovement(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Get('movements')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async listMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('productId') productId?: string,
    @Query('locationId') locationId?: string,
    @Query('movementType') movementType?: StockMovementType,
    @Query('limit') limit?: number,
  ) {
    return this.inventoryService.getStockMovements(
      user?.organizationId as string,
      {
        productId,
        locationId,
        movementType,
        limit: limit ? parseInt(limit.toString(), 10) : undefined,
      },
    );
  }

  // Stock Adjustment endpoints
  @Post('adjustments')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async createAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    return this.inventoryService.createStockAdjustment(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Post('adjustments/:id/process')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async processAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inventoryService.processStockAdjustment(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
  }

  @Get('adjustments')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async listAdjustments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('status') status?: StockAdjustmentStatus,
  ) {
    return this.inventoryService.getStockAdjustments(
      user?.organizationId as string,
      {
        locationId,
        status,
      },
    );
  }
}
