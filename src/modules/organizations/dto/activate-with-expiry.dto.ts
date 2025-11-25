import { IsDateString, IsNotEmpty } from 'class-validator';

export class ActivateOrganizationWithExpiryDto {
  @IsNotEmpty()
  @IsDateString()
  expiryDate: string;
}

