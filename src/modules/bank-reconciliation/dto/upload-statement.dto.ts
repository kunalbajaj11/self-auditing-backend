import { IsOptional, IsString } from 'class-validator';

export class UploadStatementDto {
  @IsOptional()
  @IsString()
  statementPeriodStart?: string;

  @IsOptional()
  @IsString()
  statementPeriodEnd?: string;
}
