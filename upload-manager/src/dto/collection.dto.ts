import {
    IsString,
    IsOptional,
    IsUUID,
    IsArray,
    IsBoolean,
    MaxLength,
    IsHexColor,
} from 'class-validator';

export class CreateCollectionDto {
    @IsString()
    @MaxLength(255)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @IsHexColor()
    color?: string;

    @IsOptional()
    @IsUUID()
    parentId?: string;
}

export class UpdateCollectionDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @IsHexColor()
    color?: string;

    @IsOptional()
    @IsUUID()
    parentId?: string;
}

export class AddFilesToCollectionDto {
    @IsArray()
    @IsUUID('4', { each: true })
    fileIds: string[];
}

export class RemoveFilesFromCollectionDto {
    @IsArray()
    @IsUUID('4', { each: true })
    fileIds: string[];
}

export class DeleteCollectionDto {
    @IsOptional()
    @IsBoolean()
    deleteFiles?: boolean;
}
