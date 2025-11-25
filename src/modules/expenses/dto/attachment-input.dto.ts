import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class AttachmentInputDto {
  @IsNotEmpty()
  @IsString()
  fileName: string;

  @IsNotEmpty()
  @IsString()
  fileUrl: string;

  @IsOptional()
  @IsString()
  fileKey?: string;

  @IsNotEmpty()
  @IsString()
  fileType: string;

  @IsInt()
  @Min(1)
  fileSize: number;
}

