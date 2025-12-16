import { IsNotEmpty, IsString } from 'class-validator';

export class LinkAccrualDto {
  @IsNotEmpty()
  @IsString()
  accrualExpenseId: string;
}
