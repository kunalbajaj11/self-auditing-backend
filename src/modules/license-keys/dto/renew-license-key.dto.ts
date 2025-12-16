import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class RenewLicenseKeyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  extendByDays?: number;

  @IsOptional()
  @IsDateString()
  newExpiry?: string;
}
