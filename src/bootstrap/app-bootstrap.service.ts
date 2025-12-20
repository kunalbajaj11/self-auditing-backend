import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../modules/users/users.service';
import { UserRole } from '../common/enums/user-role.enum';

@Injectable()
export class AppBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AppBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.configService.get<string>('SUPER_ADMIN_EMAIL');
    const password = this.configService.get<string>('SUPER_ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn(
        'SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set. Skipping super admin bootstrap.',
      );
      return;
    }

    const name =
      this.configService.get<string>('SUPER_ADMIN_NAME') ??
      'SelfAccounting.AI Super Admin';

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      if (existing.role !== UserRole.SUPERADMIN) {
        this.logger.warn(
          `User ${email} exists but is a ${existing.role}. No changes applied.`,
        );
      } else {
        this.logger.debug(`Super admin ${email} already present.`);
      }
      return;
    }

    await this.usersService.createSuperAdmin({
      name,
      email,
      password,
      role: UserRole.SUPERADMIN,
    });
    this.logger.log(`Super admin ${email} created successfully.`);
  }
}
