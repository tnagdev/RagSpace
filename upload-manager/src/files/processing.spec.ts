import { ProcessingStage, ProcessingStatus } from '@prisma/client';
import { nextProcessingState, ProcessingState } from './processing';

const now = new Date('2026-10-08T12:00:00Z');

const state = (overrides: Partial<ProcessingState> = {}): ProcessingState => ({
    processingStage: ProcessingStage.EMBEDDING,
    processingStatus: ProcessingStatus.IN_PROGRESS,
    processingRetryCount: 0,
    processingStartedAt: new Date('2026-10-08T11:00:00Z'),
    ...overrides,
});

describe('nextProcessingState', () => {
    it('advances to a later stage', () => {
        expect(
            nextProcessingState(state(), { stage: ProcessingStage.SCENE_DETECTION, status: ProcessingStatus.IN_PROGRESS, retryCount: 0 }, now),
        ).toEqual({
            processingStage: ProcessingStage.SCENE_DETECTION,
            processingStatus: ProcessingStatus.IN_PROGRESS,
            processingRetryCount: 0,
            errorMessage: null,
        });
    });

    it('drops reports from an earlier stage', () => {
        const current = state({ processingStage: ProcessingStage.INDEXING });
        expect(
            nextProcessingState(current, { stage: ProcessingStage.EMBEDDING, status: ProcessingStatus.COMPLETED, retryCount: 0 }, now),
        ).toBeNull();
    });

    it('ignores a report that changes nothing', () => {
        expect(
            nextProcessingState(state(), { stage: ProcessingStage.EMBEDDING, status: ProcessingStatus.IN_PROGRESS, retryCount: 0 }, now),
        ).toBeNull();
    });

    it('records retries within the same stage', () => {
        expect(
            nextProcessingState(state(), { stage: ProcessingStage.EMBEDDING, status: ProcessingStatus.IN_PROGRESS, retryCount: 2 }, now),
        ).toMatchObject({ processingRetryCount: 2 });
    });

    it('marks the pipeline complete only at the COMPLETED stage', () => {
        expect(
            nextProcessingState(state(), { stage: ProcessingStage.SCENE_DETECTION, status: ProcessingStatus.COMPLETED, retryCount: 0 }, now),
        ).toMatchObject({ processingStatus: ProcessingStatus.IN_PROGRESS });
        expect(
            nextProcessingState(state(), { stage: ProcessingStage.COMPLETED, status: ProcessingStatus.COMPLETED, retryCount: 0 }, now),
        ).toMatchObject({ processingStatus: ProcessingStatus.COMPLETED, processingCompletedAt: now });
    });

    it('fails from any stage, keeping the stage', () => {
        const update = nextProcessingState(
            state({ processingStage: ProcessingStage.INDEXING }),
            { stage: ProcessingStage.EMBEDDING, status: ProcessingStatus.FAILED, errorMessage: 'boom', retryCount: 3 },
            now,
        );
        expect(update).toEqual({ processingStatus: ProcessingStatus.FAILED, processingRetryCount: 3, errorMessage: 'boom' });
    });

    it('ignores late reports once processing has completed', () => {
        const done = state({ processingStage: ProcessingStage.COMPLETED, processingStatus: ProcessingStatus.COMPLETED });
        expect(
            nextProcessingState(done, { stage: ProcessingStage.SCENE_DETECTION, status: ProcessingStatus.FAILED, retryCount: 1 }, now),
        ).toBeNull();
    });

    it('resumes a failed file when a later stage reports progress', () => {
        expect(
            nextProcessingState(
                state({ processingStatus: ProcessingStatus.FAILED }),
                { stage: ProcessingStage.SCENE_DETECTION, status: ProcessingStatus.IN_PROGRESS, retryCount: 1 },
                now,
            ),
        ).toMatchObject({ processingStatus: ProcessingStatus.IN_PROGRESS, errorMessage: null });
    });

    it('stamps the start time once', () => {
        expect(
            nextProcessingState(
                state({ processingStartedAt: null, processingStage: ProcessingStage.UPLOAD }),
                { stage: ProcessingStage.EMBEDDING, status: ProcessingStatus.IN_PROGRESS, retryCount: 0 },
                now,
            ),
        ).toMatchObject({ processingStartedAt: now });
        expect(
            nextProcessingState(state(), { stage: ProcessingStage.INDEXING, status: ProcessingStatus.IN_PROGRESS, retryCount: 0 }, now),
        ).not.toHaveProperty('processingStartedAt');
    });
});
