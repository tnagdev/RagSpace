import { Inject, Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FileType } from '@prisma/client';
import { commonV1, quotaExceeded } from '@ragspace/shared-ts';
import { BILLING_CLIENT } from '../clients/billing.client';
import type { BillingClient } from '../clients/billing.client';
import { logger } from '../logger';
import { S3Service } from '../modules/s3/s3.service';
import type { FileRecord } from './file.mapper';

interface ProbeStream {
    codec_type?: string;
    duration?: string;
    width?: number;
    height?: number;
}

const execFileAsync = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const PROBE_TIMEOUT_MS = 10_000;
const PROBED_TYPES = new Set<FileType>([FileType.VIDEO, FileType.AUDIO, FileType.IMAGE]);

export interface MediaAttributes {
    durationSeconds?: number;
    width?: number;
    height?: number;
}

@Injectable()
export class MediaProbeService {
    constructor(
        private readonly s3: S3Service,
        @Inject(BILLING_CLIENT) private readonly billing: BillingClient,
    ) { }

    async inspect(file: FileRecord): Promise<MediaAttributes> {
        if (!PROBED_TYPES.has(file.fileType)) return {};
        try {
            const url = await this.s3.getInternalSignedUrl(file.s3Key);
            const { stdout } = await execFileAsync(
                FFPROBE,
                ['-v', 'error', '-print_format', 'json', '-show_streams', url],
                { timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
            );
            const streams: ProbeStream[] = JSON.parse(stdout).streams ?? [];
            const durations = streams.map((s) => Number(s.duration)).filter((d) => Number.isFinite(d) && d > 0);
            const visual = streams.find((s) => s.codec_type === 'video' && s.width);
            return {
                ...(durations.length > 0 && file.fileType !== FileType.IMAGE
                    ? { durationSeconds: Math.ceil(Math.max(...durations)) }
                    : {}),
                ...(visual ? { width: visual.width, height: visual.height } : {}),
            };
        } catch (error) {
            logger.warn(`Media probe failed for ${file.id}: ${(error as Error).message}`, 'MediaProbe');
            return {};
        }
    }

    async assertDurationAllowed(userId: string, fileType: FileType, durationSeconds?: number): Promise<void> {
        const metric = fileType === FileType.AUDIO
            ? 'MAX_AUDIO_DURATION'
            : fileType === FileType.VIDEO || fileType === FileType.YOUTUBE_VIDEO
                ? 'MAX_VIDEO_LENGTH'
                : undefined;
        if (!metric || !durationSeconds) return;

        const { quotas } = await this.billing.getUsage({ userId });
        const limit = quotas.find((q) => q.metric === (`USAGE_METRIC_${metric}` as commonV1.UsageMetric))?.limit ?? 0;
        if (limit > 0 && durationSeconds > limit) {
            const noun = fileType === FileType.AUDIO ? 'audio' : 'video';
            throw quotaExceeded(
                metric,
                durationSeconds,
                limit,
                `This ${noun} is ${formatDuration(durationSeconds)}; your plan allows up to ${formatDuration(limit)}`,
            );
        }
    }
}

function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

