import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SubmitYouTubeLinkDto {
    @IsNotEmpty()
    @IsString()
    @Matches(
        /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]+(\?.*)?$/,
        {
            message: 'Invalid YouTube URL',
        },
    )
    url!: string;
}
