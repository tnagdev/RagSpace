import type { ApiFile } from '@/api/types';

export function fileDuration(file: ApiFile): number | null {
    const seconds = file.attributes?.durationSeconds;
    return typeof seconds === 'number' && seconds > 0 ? seconds : null;
}

export function fileDimensions(file: ApiFile): string | null {
    const { width, height } = file.attributes ?? {};
    return typeof width === 'number' && typeof height === 'number' ? `${width}×${height}` : null;
}
