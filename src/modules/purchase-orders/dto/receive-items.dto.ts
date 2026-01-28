import {
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveItemDto {
  @IsUUID()
  lineItemId: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  receivedQuantity: number;
}

export class ReceiveItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
}
