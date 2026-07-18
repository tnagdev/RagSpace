import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateFreeSubscriptionDto {
    @IsString()
    @IsNotEmpty({ message: 'User ID is required' })
    @IsUUID('4', { message: 'User ID must be a valid UUID' })
    userId!: string;
}
