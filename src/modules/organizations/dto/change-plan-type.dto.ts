import { IsEnum, IsNotEmpty } from 'class-validator';
import { PlanType } from '../../../common/enums/plan-type.enum';

export class ChangePlanTypeDto {
  @IsEnum(PlanType)
  @IsNotEmpty()
  planType: PlanType;
}
