import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const YOUTUBE_ID = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{6,})/;
const METADATA_TIMEOUT_MS = 15_000;

export interface YouTubeInfo {
    title?: string;
    durationSeconds?: number;
    uploader?: string;
    thumbnail?: string;
}

export function parseYouTubeId(url: string): string | undefined {
    return YOUTUBE_ID.exec(url)?.[1];
}

export async function fetchYouTubeInfo(url: string): Promise<YouTubeInfo> {
    const { stdout } = await execFileAsync('yt-dlp', ['--dump-json', '--no-download', url], {
        timeout: METADATA_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
    });
    const info = JSON.parse(stdout);
    return {
        title: info.title,
        durationSeconds: typeof info.duration === 'number' ? info.duration : undefined,
        uploader: info.uploader,
        thumbnail: info.thumbnail,
    };
}
