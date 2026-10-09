import { ClientError, Status, billingV1, chatV1, commonV1, filesV1 } from '@ragspace/shared-ts';
import { toProblem } from './http/problem';
import * as map from './mappers';

describe('mappers', () => {
    it('maps a file with bare enums and explicit nulls', () => {
        const file = map.file(
            filesV1.File.fromPartial({
                id: 'f1',
                name: 'Clip',
                type: commonV1.FileType.FILE_TYPE_YOUTUBE_VIDEO,
                processingStage: commonV1.ProcessingStage.PROCESSING_STAGE_INDEXING,
                createTime: new Date('2026-10-08T00:00:00Z'),
                attributes: { durationSeconds: 61 },
            }),
        );
        expect(file).toMatchObject({
            id: 'f1',
            type: 'YOUTUBE_VIDEO',
            processingStage: 'INDEXING',
            errorMessage: null,
            downloadUrl: null,
            uploadedAt: null,
            createdAt: '2026-10-08T00:00:00.000Z',
            attributes: { durationSeconds: 61 },
        });
    });

    it('clamps hit scores and maps visual descriptions', () => {
        const hit = map.hit(
            commonV1.SearchHit.fromPartial({ fileId: 'f', score: 1.3, visual: { summary: 'A dog', objects: ['dog'], colors: [] } }),
        );
        expect(hit).toMatchObject({ score: 1, sceneId: null, visual: { summary: 'A dog', objects: ['dog'], setting: null } });
        expect(map.hit(commonV1.SearchHit.fromPartial({ fileId: 'f' })).visual).toBeNull();
    });

    it('maps chat stream events to the public union', () => {
        const tool = map.chatEvent(
            chatV1.SendMessageResponse.fromPartial({
                event: { $case: 'tool', tool: { tool: 'search_files', status: chatV1.ToolStatus.TOOL_STATUS_STARTED, argumentsJson: '{"query":"x"}' } },
            }),
        );
        expect(tool).toEqual({ type: 'tool', tool: 'search_files', status: 'STARTED', arguments: { query: 'x' }, resultCount: null });
        const done = map.chatEvent(
            chatV1.SendMessageResponse.fromPartial({ event: { $case: 'done', done: { messageId: 'm', toolsUsed: [], resultCount: 2 } } }),
        );
        expect(done).toEqual({ type: 'done', messageId: 'm', toolsUsed: [], resultCount: 2 });
    });

    it('maps plan limits keyed by metric', () => {
        const plan = map.plan(
            billingV1.Plan.fromPartial({
                id: 'p',
                type: billingV1.PlanType.PLAN_TYPE_PRO,
                limits: [{ metric: commonV1.UsageMetric.USAGE_METRIC_STORAGE, limit: 10 }],
            }),
        );
        expect(plan).toMatchObject({ type: 'PRO', limits: { STORAGE: 10 }, comparison: null });
    });
});

describe('toProblem', () => {
    const rpcError = (status: Status, meta: Record<string, string> = {}) =>
        Object.assign(new ClientError('/svc/Method', status, 'details'), { meta });

    it('maps quota exhaustion to 402 with quota details', () => {
        const body = toProblem(
            rpcError(Status.RESOURCE_EXHAUSTED, {
                'x-error-code': 'quota_exceeded',
                'x-quota-metric': 'YOUTUBE_VIDEOS',
                'x-quota-used': '3',
                'x-quota-limit': '3',
            }),
        );
        expect(body).toMatchObject({ status: 402, code: 'quota_exceeded', metric: 'YOUTUBE_VIDEOS', used: 3, limit: 3 });
    });

    it('maps gRPC statuses and hides internal details', () => {
        expect(toProblem(rpcError(Status.NOT_FOUND))).toMatchObject({ status: 404, code: 'not_found', detail: 'details' });
        expect(toProblem(rpcError(Status.FAILED_PRECONDITION)).status).toBe(409);
        expect(toProblem(rpcError(Status.UNAVAILABLE))).toMatchObject({ status: 503, code: 'upstream_unavailable' });
        expect(toProblem(rpcError(Status.INTERNAL)).detail).toBeUndefined();
        expect(toProblem(new Error('boom'))).toMatchObject({ status: 500, code: 'internal' });
    });
});
