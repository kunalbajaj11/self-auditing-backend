import { SetMetadata } from '@nestjs/common';
import { PlanType } from '../enums/plan-type.enum';

export const PLAN_TYPES_KEY = 'planTypes';

/**
 * Decorator to restrict access to specific plan types
 * @param planTypes Array of plan types that can access this endpoint
 * @example @PlanTypes(PlanType.PREMIUM, PlanType.ENTERPRISE)
 */
export const PlanTypes = (...planTypes: PlanType[]) =>
  SetMetadata(PLAN_TYPES_KEY, planTypes);
