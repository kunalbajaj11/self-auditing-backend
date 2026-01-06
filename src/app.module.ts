import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ExpenseTypesModule } from './modules/expense-types/expense-types.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { AccrualsModule } from './modules/accruals/accruals.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { PlansModule } from './modules/plans/plans.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { LicenseKeysModule } from './modules/license-keys/license-keys.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { BankReconciliationModule } from './modules/bank-reconciliation/bank-reconciliation.module';
import { ForexModule } from './modules/forex/forex.module';
import { DuplicatesModule } from './modules/duplicates/duplicates.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { ContactModule } from './modules/contact/contact.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesInvoicesModule } from './modules/sales-invoices/sales-invoices.module';
import { CreditNotesModule } from './modules/credit-notes/credit-notes.module';
import { DebitNotesModule } from './modules/debit-notes/debit-notes.module';
import { ExpensePaymentsModule } from './modules/expense-payments/expense-payments.module';
import { SettingsModule } from './modules/settings/settings.module';
import { JournalEntriesModule } from './modules/journal-entries/journal-entries.module';
import { RegionConfigModule } from './modules/region-config/region-config.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProductsModule } from './modules/products/products.module';
import { TaxRulesModule } from './modules/tax-rules/tax-rules.module';
import { TaxFormsModule } from './modules/tax-forms/tax-forms.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { AppBootstrapService } from './bootstrap/app-bootstrap.service';
import { SanitizeAttachmentsInterceptor } from './common/interceptors/sanitize-attachments.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
        autoLoadEntities: true,
      }),
    }),
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CategoriesModule,
    ExpenseTypesModule,
    ExpensesModule,
    AccrualsModule,
    NotificationsModule,
    ReportsModule,
    AuditLogsModule,
    PlansModule,
    OcrModule,
    SuperAdminModule,
    LicenseKeysModule,
    AttachmentsModule,
    SchedulerModule,
    BankReconciliationModule,
    ForexModule,
    DuplicatesModule,
    VendorsModule,
    ContactModule,
    CustomersModule,
    SalesInvoicesModule,
    CreditNotesModule,
    DebitNotesModule,
    ExpensePaymentsModule,
    SettingsModule,
    JournalEntriesModule,
    RegionConfigModule,
    PayrollModule,
    InventoryModule,
    ProductsModule,
    TaxRulesModule,
    TaxFormsModule,
    ComplianceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppBootstrapService,
    {
      provide: APP_INTERCEPTOR,
      useClass: SanitizeAttachmentsInterceptor,
    },
  ],
})
export class AppModule {}
