import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { PlanType } from '../enums/plan-type.enum';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class EnterpriseLicenseGuard implements CanActivate {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // SuperAdmin bypasses license checks
    if (user.role === UserRole.SUPERADMIN) {
      return true;
    }

    if (!user.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    const organization = await this.organizationsRepository.findOne({
      where: { id: user.organizationId },
    });

    if (!organization) {
      throw new ForbiddenException('Organization not found');
    }

    if (organization.planType !== PlanType.ENTERPRISE) {
      throw new ForbiddenException(
        'This feature requires an Enterprise license',
      );
    }

    return true;
  }
}

