import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateNumberingSettingsDto {
  @IsOptional()
  @IsBoolean()
  numberingUseSequential?: boolean;

  @IsOptional()
  @IsBoolean()
  numberingAllowManual?: boolean;

  @IsOptional()
  @IsBoolean()
  numberingWarnDuplicates?: boolean;
}
