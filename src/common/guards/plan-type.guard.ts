import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reflector } from '@nestjs/core';
import { Organization } from '../../entities/organization.entity';
import { PlanType } from '../enums/plan-type.enum';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PLAN_TYPES_KEY } from '../decorators/plan-types.decorator';

@Injectable()
export class PlanTypeGuard implements CanActivate {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlanTypes = this.reflector.getAllAndOverride<PlanType[]>(
      PLAN_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no plan type restriction, allow access
    if (!requiredPlanTypes || requiredPlanTypes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;
    if (!user || !user.organizationId) {
      throw new ForbiddenException('Organization context is required');
    }

    // Get organization to check plan type
    const organization = await this.organizationsRepository.findOne({
      where: { id: user.organizationId },
      select: ['id', 'planType'],
    });

    if (!organization) {
      throw new ForbiddenException('Organization not found');
    }

    // Check if organization's plan type is in the allowed list
    if (!requiredPlanTypes.includes(organization.planType)) {
      throw new ForbiddenException(
        `This feature requires one of the following plans: ${requiredPlanTypes.join(', ')}. Your current plan: ${organization.planType}`,
      );
    }

    return true;
  }
}
