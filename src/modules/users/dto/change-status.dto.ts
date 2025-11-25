import { IsEnum } from 'class-validator';
import { UserStatus } from '../../../common/enums/user-status.enum';

export class ChangeUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}

