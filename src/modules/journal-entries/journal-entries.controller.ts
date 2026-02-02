import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JournalEntriesService } from './journal-entries.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { LicenseFeatureGuard } from '../../common/guards/license-feature.guard';
import { RequireLicenseFeature } from '../../common/decorators/license-feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { BulkCreateJournalEntryDto } from './dto/bulk-create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { JournalEntryFilterDto } from './dto/journal-entry-filter.dto';

@Controller('journal-entries')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class JournalEntriesController {
  constructor(private readonly journalEntriesService: JournalEntriesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: JournalEntryFilterDto,
  ) {
    return this.journalEntriesService.findAll(
      user?.organizationId as string,
      filters,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.journalEntriesService.findById(
      user?.organizationId as string,
      id,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.journalEntriesService.create(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Post('bulk')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @UseGuards(LicenseFeatureGuard)
  @RequireLicenseFeature('bulkJournalImport')
  async bulkCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkCreateJournalEntryDto,
  ) {
    return this.journalEntriesService.bulkCreate(
      user?.organizationId as string,
      user?.userId as string,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.journalEntriesService.update(
      user?.organizationId as string,
      id,
      dto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.journalEntriesService.delete(user?.organizationId as string, id);
    return { message: 'Journal entry deleted successfully' };
  }
}
