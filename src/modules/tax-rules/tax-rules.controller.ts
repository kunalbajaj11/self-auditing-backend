import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { CreateTaxBracketDto } from './dto/create-tax-bracket.dto';
import { CreateTaxExemptionDto } from './dto/create-tax-exemption.dto';
import { CreateCategoryTaxRuleDto } from './dto/create-category-tax-rule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@Controller('tax-rules')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class TaxRulesController {
  constructor(private readonly taxRulesService: TaxRulesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async getTaxRules(@CurrentUser() user: AuthenticatedUser) {
    return this.taxRulesService.getTaxRules(user?.organizationId as string);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async createTaxRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaxRuleDto,
  ) {
    return this.taxRulesService.createTaxRule(
      user?.organizationId as string,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async updateTaxRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTaxRuleDto>,
  ) {
    return this.taxRulesService.updateTaxRule(
      user?.organizationId as string,
      id,
      dto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteTaxRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.taxRulesService.deleteTaxRule(
      user?.organizationId as string,
      id,
    );
    return { success: true };
  }

  @Post(':ruleId/brackets')
  @Roles(UserRole.ADMIN)
  async addTaxBracket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ruleId') ruleId: string,
    @Body() dto: CreateTaxBracketDto,
  ) {
    return this.taxRulesService.addTaxBracket(
      user?.organizationId as string,
      ruleId,
      dto,
    );
  }

  @Post(':ruleId/exemptions')
  @Roles(UserRole.ADMIN)
  async addTaxExemption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ruleId') ruleId: string,
    @Body() dto: CreateTaxExemptionDto,
  ) {
    return this.taxRulesService.addTaxExemption(
      user?.organizationId as string,
      ruleId,
      dto,
    );
  }

  @Post(':ruleId/category-rules')
  @Roles(UserRole.ADMIN)
  async addCategoryTaxRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ruleId') ruleId: string,
    @Body() dto: CreateCategoryTaxRuleDto,
  ) {
    return this.taxRulesService.addCategoryTaxRule(
      user?.organizationId as string,
      ruleId,
      dto,
    );
  }

  @Post('calculate')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async calculateTax(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: any,
  ) {
    return this.taxRulesService.calculateTax({
      ...input,
      organizationId: user?.organizationId as string,
    });
  }
}
