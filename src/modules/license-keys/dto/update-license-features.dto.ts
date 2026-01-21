import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateLicenseFeaturesDto {
  @IsOptional()
  @IsBoolean()
  enablePayroll?: boolean;

  @IsOptional()
  @IsBoolean()
  enableInventory?: boolean;
}
