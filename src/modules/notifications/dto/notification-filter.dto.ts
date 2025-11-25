import { IsBooleanString, IsEnum, IsOptional } from 'class-validator';
import { NotificationType } from '../../../common/enums/notification-type.enum';

export class NotificationFilterDto {
  @IsOptional()
  @IsBooleanString()
  isRead?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

