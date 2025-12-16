import { IsEnum } from 'class-validator';
import { OrganizationStatus } from '../../../common/enums/organization-status.enum';

export class ChangeOrganizationStatusDto {
  @IsEnum(OrganizationStatus)
  status: OrganizationStatus;
}
