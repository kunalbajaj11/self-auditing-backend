import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateLicenseDto {
  @IsNotEmpty()
  @IsString()
  licenseKey: string;
}

