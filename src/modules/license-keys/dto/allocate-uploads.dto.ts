import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class AllocateUploadsDto {
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  additionalUploads: number;
}

