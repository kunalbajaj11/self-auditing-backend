import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;
    if (!user) {
      return false;
    }

    if (user.role === UserRole.SUPERADMIN) {
      return true;
    }

    if (!user.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    return true;
  }
}
