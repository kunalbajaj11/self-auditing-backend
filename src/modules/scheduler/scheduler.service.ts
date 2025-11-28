import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { Accrual } from '../../entities/accrual.entity';
import { SalesInvoice } from '../../entities/sales-invoice.entity';
import { Expense } from '../../entities/expense.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { NotificationChannel } from '../../common/enums/notification-channel.enum';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { AccrualStatus } from '../../common/enums/accrual-status.enum';
import { InvoiceStatus } from '../../common/enums/invoice-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { ExpenseStatus } from '../../common/enums/expense-status.enum';
import { ReconciliationRecord } from '../../entities/reconciliation-record.entity';
import { ReconciliationStatus } from '../../common/enums/reconciliation-status.enum';
import { User } from '../../entities/user.entity';
import { UserRole } from '../../common/enums/user-role.enum';

@Injectable()
export class SchedulerService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(Accrual)
    private readonly accrualsRepository: Repository<Accrual>,
    @InjectRepository(SalesInvoice)
    private readonly salesInvoicesRepository: Repository<SalesInvoice>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(ReconciliationRecord)
    private readonly reconciliationRecordsRepository: Repository<ReconciliationRecord>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  // Run every hour to send scheduled notifications
  @Cron(CronExpression.EVERY_HOUR)
  async sendScheduledNotifications() {
    const now = new Date();
    const scheduledNotifications = await this.notificationsRepository.find({
      where: {
        isRead: false,
        sentAt: null,
      },
      relations: ['user', 'organization'],
    });

    for (const notification of scheduledNotifications) {
      if (
        notification.scheduledFor &&
        new Date(notification.scheduledFor) <= now
      ) {
        // Send email if channel includes email
        if (
          notification.channel === NotificationChannel.EMAIL &&
          notification.user?.email
        ) {
          const sent = await this.emailService.sendNotificationEmail(
            notification.user.email,
            notification.title,
            notification.message,
            notification.type,
          );

          if (sent) {
            notification.sentAt = new Date();
            await this.notificationsRepository.save(notification);
          }
        }
      }
    }
  }

  // Run daily at 9 AM to check for accrual reminders
  @Cron('0 9 * * *')
  async checkAccrualReminders() {
    const reminderOffsetDays = Number(
      process.env.ACCRUAL_REMINDER_OFFSET_DAYS ?? 2,
    );
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + reminderOffsetDays);
    const reminderDateStr = reminderDate.toISOString().split('T')[0];

    const accruals = await this.accrualsRepository.find({
      where: {
        status: AccrualStatus.PENDING_SETTLEMENT,
      },
      relations: ['organization', 'expense', 'expense.user'],
    });

    for (const accrual of accruals) {
      // Priority 1: Skip if accrual is settled (may have changed since query)
      const currentAccrual = await this.accrualsRepository.findOne({
        where: { id: accrual.id },
      });
      if (
        currentAccrual?.status !== AccrualStatus.PENDING_SETTLEMENT
      ) {
        continue;
      }

      if (
        accrual.expectedPaymentDate &&
        accrual.expectedPaymentDate === reminderDateStr
      ) {
        const user = accrual.expense?.user;
        if (user?.email) {
          // Priority 2: Check if we already sent a reminder for this specific accrual
          const existingNotification = await this.notificationsRepository.findOne({
            where: {
              organization: { id: accrual.organization.id },
              entityType: 'accrual',
              entityId: accrual.id,
              type: NotificationType.ACCRUAL_REMINDER,
            },
          });

          // Only send if no reminder was sent for this accrual
          if (!existingNotification) {
            const title = 'Accrual Payment Reminder';
            const vendorName =
              accrual.vendorName || accrual.expense?.vendorName || 'Vendor';
            const message = `Reminder: Payment of ${accrual.expense?.currency || 'AED'} ${accrual.amount} for accrual (Vendor: ${vendorName}) is due on ${accrual.expectedPaymentDate}. Please ensure settlement.`;

            // Prepare template variables
            const templateVars = {
              vendorName: vendorName,
              currency: accrual.expense?.currency || 'AED',
              amount: accrual.amount,
              expectedPaymentDate: accrual.expectedPaymentDate,
            };

            await this.notificationsService.scheduleNotification({
              organizationId: accrual.organization.id,
              userId: user.id,
              title,
              message,
              type: NotificationType.ACCRUAL_REMINDER,
              channel: NotificationChannel.EMAIL,
              entityType: 'accrual',
              entityId: accrual.id,
              templateVariables: templateVars,
            });

            // Also notify admins/accountants
            const adminsAndAccountants = await this.usersRepository.find({
              where: {
                organization: { id: accrual.organization.id },
                role: In([UserRole.ADMIN, UserRole.ACCOUNTANT]),
              },
            });

            for (const admin of adminsAndAccountants) {
              if (admin.email && admin.id !== user.id) {
                await this.notificationsService.scheduleNotification({
                  organizationId: accrual.organization.id,
                  userId: admin.id,
                  title,
                  message,
                  type: NotificationType.ACCRUAL_REMINDER,
                  channel: NotificationChannel.EMAIL,
                  entityType: 'accrual',
                  entityId: accrual.id,
                  templateVariables: templateVars,
                });
              }
            }
          }
        }
      }
    }
  }

  // Run weekly on Monday at 9 AM to check for pending reconciliations
  @Cron('0 9 * * 1')
  async checkPendingReconciliations() {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const records = await this.reconciliationRecordsRepository.find({
      where: {},
      relations: ['organization', 'createdBy', 'bankTransactions'],
    });

    for (const record of records) {
      // Check if there are unmatched transactions
      const unmatchedCount = record.bankTransactions?.filter(
        (t) => t.status === ReconciliationStatus.UNMATCHED,
      ).length || 0;

      if (unmatchedCount > 0) {
        // Find admin users for the organization
        const adminUsers = await this.usersRepository.find({
          where: {
            organization: { id: record.organization.id },
            role: UserRole.ADMIN,
          },
        });

        for (const admin of adminUsers) {
          if (admin.email) {
            const title = 'Pending Bank Reconciliation';
            const message = `You have ${unmatchedCount} unmatched transaction(s) in your bank reconciliation dated ${record.reconciliationDate}. Please review and complete the reconciliation.`;

            await this.notificationsService.scheduleNotification({
              organizationId: record.organization.id,
              userId: admin.id,
              title,
              message,
              type: NotificationType.SYSTEM,
              channel: NotificationChannel.EMAIL,
            });
          }
        }
      }
    }
  }

  // Run daily at 9 AM to check for invoices due in 3 days
  @Cron('0 9 * * *')
  async checkInvoicesDueSoon() {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysFromNowStr = threeDaysFromNow.toISOString().split('T')[0];

    const invoices = await this.salesInvoicesRepository.find({
      where: {
        status: InvoiceStatus.SENT,
        paymentStatus: PaymentStatus.UNPAID,
        isDeleted: false,
      },
      relations: ['organization', 'user', 'customer'],
    });

    for (const invoice of invoices) {
      // Priority 1: Skip if invoice is paid
      if (invoice.paymentStatus === PaymentStatus.PAID) {
        continue;
      }

      // Double-check payment status by re-fetching (may have changed since query)
      const currentInvoice = await this.salesInvoicesRepository.findOne({
        where: { id: invoice.id },
      });
      if (
        currentInvoice?.paymentStatus === PaymentStatus.PAID ||
        currentInvoice?.status === InvoiceStatus.CANCELLED
      ) {
        continue;
      }

      if (
        invoice.dueDate &&
        invoice.dueDate === threeDaysFromNowStr &&
        (invoice.user?.email || invoice.customer?.email)
      ) {
        // Priority 2: Check if we already sent a reminder for this specific invoice
        const existingNotification = await this.notificationsRepository.findOne({
          where: {
            organization: { id: invoice.organization.id },
            entityType: 'invoice',
            entityId: invoice.id,
            type: NotificationType.INVOICE_DUE_SOON,
          },
        });

        // Only send if no reminder was sent for this invoice
        if (!existingNotification) {
          const customerName =
            invoice.customer?.name || invoice.customerName || 'Customer';
          const title = 'Invoice Due in 3 Days';
          const message = `Invoice #${invoice.invoiceNumber} for ${customerName} (Amount: ${invoice.currency} ${invoice.totalAmount}) is due in 3 days on ${invoice.dueDate}. Please follow up for payment.`;

          // Prepare template variables
          const templateVars = {
            invoiceNumber: invoice.invoiceNumber,
            customerName: customerName,
            currency: invoice.currency,
            totalAmount: invoice.totalAmount,
            dueDate: invoice.dueDate,
          };

          // Send to internal user
          if (invoice.user?.email) {
            await this.notificationsService.scheduleNotification({
              organizationId: invoice.organization.id,
              userId: invoice.user.id,
              title,
              message,
              type: NotificationType.INVOICE_DUE_SOON,
              channel: NotificationChannel.EMAIL,
              entityType: 'invoice',
              entityId: invoice.id,
              templateVariables: templateVars,
            });
          }

          // Priority 1: Send to customer email if available
          if (invoice.customer?.email) {
            await this.notificationsService.scheduleNotification({
              organizationId: invoice.organization.id,
              title,
              message,
              type: NotificationType.INVOICE_DUE_SOON,
              channel: NotificationChannel.EMAIL,
              entityType: 'invoice',
              entityId: invoice.id,
              recipientEmail: invoice.customer.email,
              templateVariables: templateVars,
            });
          }

          // Also notify admins/accountants
          const adminsAndAccountants = await this.usersRepository.find({
            where: {
              organization: { id: invoice.organization.id },
              role: In([UserRole.ADMIN, UserRole.ACCOUNTANT]),
            },
          });

          for (const admin of adminsAndAccountants) {
            if (admin.email && admin.id !== invoice.user?.id) {
              await this.notificationsService.scheduleNotification({
                organizationId: invoice.organization.id,
                userId: admin.id,
                title,
                message,
                type: NotificationType.INVOICE_DUE_SOON,
                channel: NotificationChannel.EMAIL,
                entityType: 'invoice',
                entityId: invoice.id,
                templateVariables: templateVars,
              });
            }
          }
        }
      }
    }
  }

  // Run daily at 9 AM to check for overdue invoices
  @Cron('0 9 * * *')
  async checkOverdueInvoices() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const invoices = await this.salesInvoicesRepository.find({
      where: {
        status: InvoiceStatus.SENT,
        paymentStatus: PaymentStatus.UNPAID,
        isDeleted: false,
      },
      relations: ['organization', 'user', 'customer'],
    });

    for (const invoice of invoices) {
      // Priority 1: Skip if invoice is paid
      if (invoice.paymentStatus === PaymentStatus.PAID) {
        continue;
      }

      // Double-check payment status by re-fetching (may have changed since query)
      const currentInvoice = await this.salesInvoicesRepository.findOne({
        where: { id: invoice.id },
      });
      if (
        currentInvoice?.paymentStatus === PaymentStatus.PAID ||
        currentInvoice?.status === InvoiceStatus.CANCELLED
      ) {
        continue;
      }

      if (
        invoice.dueDate &&
        invoice.dueDate < todayStr &&
        (invoice.user?.email || invoice.customer?.email)
      ) {
        // Priority 2: Check if we already sent a reminder for this specific invoice today
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        const existingNotification = await this.notificationsRepository
          .createQueryBuilder('notification')
          .where('notification.organization_id = :orgId', {
            orgId: invoice.organization.id,
          })
          .andWhere('notification.entity_type = :entityType', {
            entityType: 'invoice',
          })
          .andWhere('notification.entity_id = :entityId', {
            entityId: invoice.id,
          })
          .andWhere('notification.type = :type', {
            type: NotificationType.INVOICE_OVERDUE,
          })
          .andWhere('notification.created_at >= :todayStart', { todayStart })
          .getOne();

        // Only send if no reminder was sent for this invoice today
        if (!existingNotification) {
          const customerName =
            invoice.customer?.name || invoice.customerName || 'Customer';
          const daysOverdue = Math.floor(
            (today.getTime() - new Date(invoice.dueDate).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          const title = 'Overdue Invoice';
          const message = `Invoice #${invoice.invoiceNumber} for ${customerName} (Amount: ${invoice.currency} ${invoice.totalAmount}) is ${daysOverdue} day(s) overdue. Please take immediate action.`;

          // Prepare template variables
          const templateVars = {
            invoiceNumber: invoice.invoiceNumber,
            customerName: customerName,
            currency: invoice.currency,
            totalAmount: invoice.totalAmount,
            daysOverdue: daysOverdue.toString(),
          };

          // Send to internal user
          if (invoice.user?.email) {
            await this.notificationsService.scheduleNotification({
              organizationId: invoice.organization.id,
              userId: invoice.user.id,
              title,
              message,
              type: NotificationType.INVOICE_OVERDUE,
              channel: NotificationChannel.EMAIL,
              entityType: 'invoice',
              entityId: invoice.id,
              templateVariables: templateVars,
            });
          }

          // Priority 1: Send to customer email if available
          if (invoice.customer?.email) {
            await this.notificationsService.scheduleNotification({
              organizationId: invoice.organization.id,
              title,
              message,
              type: NotificationType.INVOICE_OVERDUE,
              channel: NotificationChannel.EMAIL,
              entityType: 'invoice',
              entityId: invoice.id,
              recipientEmail: invoice.customer.email,
              templateVariables: templateVars,
            });
          }

          // Also notify admins/accountants
          const adminsAndAccountants = await this.usersRepository.find({
            where: {
              organization: { id: invoice.organization.id },
              role: In([UserRole.ADMIN, UserRole.ACCOUNTANT]),
            },
          });

          for (const admin of adminsAndAccountants) {
            if (admin.email && admin.id !== invoice.user?.id) {
              await this.notificationsService.scheduleNotification({
                organizationId: invoice.organization.id,
                userId: admin.id,
                title,
                message,
                type: NotificationType.INVOICE_OVERDUE,
                channel: NotificationChannel.EMAIL,
                entityType: 'invoice',
                entityId: invoice.id,
                templateVariables: templateVars,
              });
            }
          }
        }
      }
    }
  }

  // Run daily at 10 AM to check for pending expense approvals
  @Cron('0 10 * * *')
  async checkPendingExpenseApprovals() {
    const pendingExpenses = await this.expensesRepository.find({
      where: {
        status: ExpenseStatus.PENDING,
        isDeleted: false,
      },
      relations: ['organization', 'user'],
    });

    // Priority 1: Filter out expenses that are now approved (may have changed since query)
    const stillPendingExpenses: Expense[] = [];
    for (const expense of pendingExpenses) {
      const currentExpense = await this.expensesRepository.findOne({
        where: { id: expense.id },
      });
      if (currentExpense?.status === ExpenseStatus.PENDING) {
        stillPendingExpenses.push(expense);
      }
    }

    // Group expenses by organization to avoid spamming
    const expensesByOrg = new Map<string, Expense[]>();
    for (const expense of stillPendingExpenses) {
      const orgId = expense.organization.id;
      if (!expensesByOrg.has(orgId)) {
        expensesByOrg.set(orgId, []);
      }
      expensesByOrg.get(orgId)!.push(expense);
    }

    for (const [orgId, expenses] of expensesByOrg.entries()) {
      if (expenses.length === 0) continue;

      // Find admin and accountant users for the organization
      const approvers = await this.usersRepository.find({
        where: {
          organization: { id: orgId },
          role: In([UserRole.ADMIN, UserRole.ACCOUNTANT]),
        },
      });

      if (approvers.length > 0) {
        // Priority 2: Check if we already sent a reminder for this set of expenses today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Create a unique identifier for this set of expenses
        const expenseIds = expenses.map((e) => e.id).sort().join(',');
        const expenseIdsHash = expenseIds.substring(0, 100); // Use first 100 chars as identifier

        const existingNotification = await this.notificationsRepository
          .createQueryBuilder('notification')
          .where('notification.organization_id = :orgId', { orgId })
          .andWhere('notification.type = :type', {
            type: NotificationType.EXPENSE_APPROVAL_PENDING,
          })
          .andWhere('notification.message LIKE :expenseRef', {
            expenseRef: `%${expenses.length} expense(s)%`,
          })
          .andWhere('notification.created_at >= :todayStart', { todayStart })
          .getOne();

        // Only send if no reminder was sent today
        if (!existingNotification) {
          const totalAmount = expenses.reduce(
            (sum, e) => sum + parseFloat(e.totalAmount),
            0,
          );
          const title = 'Expense Approval Pending';
          const message = `You have ${expenses.length} expense(s) totaling ${expenses[0]?.currency || 'AED'} ${totalAmount.toFixed(2)} pending approval. Please review and approve them.`;

          // Prepare template variables
          const templateVars = {
            expenseCount: expenses.length.toString(),
            currency: expenses[0]?.currency || 'AED',
            totalAmount: totalAmount.toFixed(2),
          };

          for (const approver of approvers) {
            if (approver.email) {
              await this.notificationsService.scheduleNotification({
                organizationId: orgId,
                userId: approver.id,
                title,
                message,
                type: NotificationType.EXPENSE_APPROVAL_PENDING,
                channel: NotificationChannel.EMAIL,
                entityType: 'expense_batch',
                entityId: expenseIdsHash, // Use hash as entity ID for batch
                templateVariables: templateVars,
              });
            }
          }
        }
      }
    }
  }
}

