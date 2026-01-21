import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProfileUserMappingDto {
  profileId: string;
  userId: string;
}

export class BulkUpdateProfilesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileUserMappingDto)
  mappings: ProfileUserMappingDto[];
}
