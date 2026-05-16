import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateFileMetadataDto } from './create-metadata.dto';

export class BatchUpsertFileMetadataDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CreateFileMetadataDto)
    items: CreateFileMetadataDto[];
}
