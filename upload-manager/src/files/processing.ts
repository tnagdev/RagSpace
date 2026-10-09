import { ProcessingStage, ProcessingStatus } from '@prisma/client';

const STAGE_ORDER: ProcessingStage[] = [
    ProcessingStage.UPLOAD,
    ProcessingStage.EMBEDDING,
    ProcessingStage.SCENE_DETECTION,
    ProcessingStage.INDEXING,
    ProcessingStage.COMPLETED,
];

export interface ProcessingState {
    processingStage: ProcessingStage;
    processingStatus: ProcessingStatus;
    processingRetryCount: number;
    processingStartedAt: Date | null;
}

export interface StageChange {
    stage: ProcessingStage;
    status: ProcessingStatus;
    errorMessage?: string;
    retryCount: number;
}

export interface ProcessingUpdate {
    processingStage?: ProcessingStage;
    processingStatus: ProcessingStatus;
    processingRetryCount: number;
    errorMessage: string | null;
    processingStartedAt?: Date;
    processingCompletedAt?: Date;
}

// Returns null when the change is stale (an earlier stage, or anything after
// completion; reprocessing resets the state first) or changes nothing.
export function nextProcessingState(current: ProcessingState, change: StageChange, now: Date): ProcessingUpdate | null {
    if (current.processingStatus === ProcessingStatus.COMPLETED) return null;

    if (change.status === ProcessingStatus.FAILED) {
        return {
            processingStatus: ProcessingStatus.FAILED,
            processingRetryCount: change.retryCount,
            errorMessage: change.errorMessage ?? 'Processing failed',
        };
    }

    if (STAGE_ORDER.indexOf(change.stage) < STAGE_ORDER.indexOf(current.processingStage)) return null;

    const finished = change.stage === ProcessingStage.COMPLETED;
    const status = finished ? ProcessingStatus.COMPLETED : ProcessingStatus.IN_PROGRESS;
    if (
        change.stage === current.processingStage &&
        status === current.processingStatus &&
        change.retryCount === current.processingRetryCount
    ) {
        return null;
    }

    return {
        processingStage: change.stage,
        processingStatus: status,
        processingRetryCount: change.retryCount,
        errorMessage: null,
        ...(current.processingStartedAt ? {} : { processingStartedAt: now }),
        ...(finished ? { processingCompletedAt: now } : {}),
    };
}
