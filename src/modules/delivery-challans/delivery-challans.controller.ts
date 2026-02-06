import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { DeliveryChallansService } from './delivery-challans.service';
import { DeliveryChallanFilterDto } from './dto/delivery-challan-filter.dto';
import { CreateDeliveryChallanDto } from './dto/create-delivery-challan.dto';
import { UpdateDeliveryChallanDto } from './dto/update-delivery-challan.dto';
import { DeliveryChallanStatus } from '../../common/enums/delivery-challan-status.enum';

@Controller('delivery-challans')
export class DeliveryChallansController {
  constructor(
    private readonly deliveryChallansService: DeliveryChallansService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: DeliveryChallanFilterDto,
  ) {
    return this.deliveryChallansService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get('next-challan-number')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getNextNumber(@CurrentUser() user: AuthenticatedUser) {
    const challanNumber =
      await this.deliveryChallansService.getNextChallanNumber(
        user?.organizationId as string,
      );
    return { challanNumber };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveryChallansService.findById(
      user?.organizationId as string,
      id,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeliveryChallanDto,
  ) {
    return this.deliveryChallansService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Post('from-sales-order/:salesOrderId')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async createFromSalesOrder(
    @Param('salesOrderId') salesOrderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    dto: {
      challanDate: string;
      notes?: string;
      deliveryAddress?: string;
      vehicleNumber?: string;
      transportMode?: string;
      lrNumber?: string;
      lineItems?: Array<{ salesOrderLineItemId?: string; quantity: number }>;
    },
  ) {
    return this.deliveryChallansService.createFromSalesOrder(
      user?.organizationId as string,
      user?.userId as string,
      salesOrderId,
      dto,
    );
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDeliveryChallanDto,
  ) {
    return this.deliveryChallansService.update(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { status: DeliveryChallanStatus },
  ) {
    return this.deliveryChallansService.updateStatus(
      user?.organizationId as string,
      id,
      user?.userId as string,
      dto.status,
    );
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.EMPLOYEE)
  async downloadPDF(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const pdfBuffer =
      await this.deliveryChallansService.generateDeliveryChallanPDF(
        id,
        user?.organizationId as string,
      );
    const dc = await this.deliveryChallansService.findById(
      user?.organizationId as string,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="delivery-challan-${dc.challanNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  }

  @Post(':id/send-email')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async sendEmail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    emailData: {
      recipientEmail: string;
      subject?: string;
      message?: string;
    },
  ) {
    await this.deliveryChallansService.sendDeliveryChallanEmail(
      id,
      user?.organizationId as string,
      user?.userId as string,
      emailData,
    );
    return { message: 'Delivery challan email sent successfully' };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.deliveryChallansService.delete(
      user?.organizationId as string,
      id,
      user?.userId as string,
    );
    return { message: 'Delivery challan deleted successfully' };
  }
}
