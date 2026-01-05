import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseKeysService } from '../../modules/license-keys/license-keys.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { LICENSE_FEATURE_KEY } from '../decorators/license-feature.decorator';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class LicenseFeatureGuard implements CanActivate {
  constructor(
    private readonly licenseKeysService: LicenseKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<
      'payroll' | 'inventory'
    >(LICENSE_FEATURE_KEY, [context.getHandler(), context.getClass()]);

    // If no feature restriction, allow access
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Super admins can always access
    if (user.role === UserRole.SUPERADMIN) {
      return true;
    }

    if (!user.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    // Check if the feature is enabled for this organization's license
    const isEnabled = await this.licenseKeysService.isFeatureEnabled(
      user.organizationId,
      requiredFeature,
    );

    if (!isEnabled) {
      const featureName =
        requiredFeature === 'payroll' ? 'Payroll' : 'Inventory';
      throw new ForbiddenException(
        `${featureName} feature is not enabled for your license. Please contact your administrator to enable this feature.`,
      );
    }

    return true;
  }
}

