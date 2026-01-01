import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      name: string;
      sku?: string;
      description?: string;
      unitPrice?: number;
      unitOfMeasure?: string;
      vatRate?: number;
    },
  ) {
    return this.productsService.create(user?.organizationId as string, body);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.productsService.findAll(user?.organizationId as string);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.findById(user?.organizationId as string, id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Partial<any>,
  ) {
    return this.productsService.update(
      user?.organizationId as string,
      id,
      body,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.productsService.delete(user?.organizationId as string, id);
    return { message: 'Product deleted successfully' };
  }
}
