import { IsBoolean } from 'class-validator';

export class MarkNotificationDto {
  @IsBoolean()
  isRead: boolean;
}

