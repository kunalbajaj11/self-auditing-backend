import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class UpgradeLicenseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  licenseKey: string;
}
