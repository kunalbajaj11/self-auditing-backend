import { IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateJournalEntryDto } from './create-journal-entry.dto';

export class BulkCreateJournalEntryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalEntryDto)
  @ArrayMinSize(1, { message: 'At least one journal entry is required' })
  @ArrayMaxSize(500, { message: 'Maximum 500 entries per bulk import' })
  entries: CreateJournalEntryDto[];
}
