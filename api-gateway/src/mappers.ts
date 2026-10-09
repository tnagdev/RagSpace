import {
    authV1,
    billingV1,
    chatV1,
    collectionsV1,
    commonV1,
    eventsV1,
    filesV1,
    fromProtoEnum,
    toProtoEnum,
} from '@ragspace/shared-ts';

type Json = Record<string, unknown>;

const iso = (value: Date | undefined): string | null => (value ? value.toISOString() : null);
const orNull = <T>(value: T | undefined): T | null => (value === undefined || value === '' ? null : value);
const bare = (prefix: string, value: string | undefined): string | null => fromProtoEnum(prefix, value) ?? null;

export const toFileType = (value: string) => toProtoEnum<commonV1.FileType>('FILE_TYPE', value);
export const toUploadStatus = (value: string) => toProtoEnum<commonV1.UploadStatus>('UPLOAD_STATUS', value);
export const toProcessingStatus = (value: string) => toProtoEnum<commonV1.ProcessingStatus>('PROCESSING_STATUS', value);
export const toProcessingStage = (value: string) => toProtoEnum<commonV1.ProcessingStage>('PROCESSING_STAGE', value);

export function page<T>(items: T[], nextPageToken: string): { items: T[]; nextCursor: string | null } {
    return { items, nextCursor: nextPageToken || null };
}

export function user(value: authV1.User | undefined): Json {
    const u = value ?? authV1.User.fromPartial({});
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        username: orNull(u.username),
        imageUrl: orNull(u.imageUrl),
        emailVerified: u.emailVerified,
        createdAt: iso(u.createTime),
        updatedAt: iso(u.updateTime),
    };
}

export function file(value: filesV1.File | undefined): Json {
    const f = value ?? filesV1.File.fromPartial({});
    return {
        id: f.id,
        name: f.name,
        originalName: f.originalName,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        type: bare('FILE_TYPE', f.type),
        uploadStatus: bare('UPLOAD_STATUS', f.uploadStatus),
        processingStatus: bare('PROCESSING_STATUS', f.processingStatus),
        processingStage: bare('PROCESSING_STAGE', f.processingStage),
        errorMessage: orNull(f.errorMessage),
        youtubeUrl: orNull(f.youtubeUrl),
        thumbnailUrl: orNull(f.thumbnailUrl),
        downloadUrl: orNull(f.downloadUrl),
        attributes: f.attributes ?? {},
        createdAt: iso(f.createTime),
        updatedAt: iso(f.updateTime),
        uploadedAt: iso(f.uploadCompleteTime),
        processingStartedAt: iso(f.processingStartTime),
        processingCompletedAt: iso(f.processingCompleteTime),
    };
}

export function fileState(value: filesV1.File): Json {
    return {
        id: value.id,
        name: value.name,
        uploadStatus: bare('UPLOAD_STATUS', value.uploadStatus),
        processingStatus: bare('PROCESSING_STATUS', value.processingStatus),
        processingStage: bare('PROCESSING_STAGE', value.processingStage),
        progressPercent: null,
        errorMessage: orNull(value.errorMessage),
        updatedAt: iso(value.updateTime),
    };
}

export function fileUpdate(value: eventsV1.FileUpdated): Json {
    return {
        id: value.fileId,
        name: value.name,
        uploadStatus: bare('UPLOAD_STATUS', value.uploadStatus),
        processingStatus: bare('PROCESSING_STATUS', value.processingStatus),
        processingStage: bare('PROCESSING_STAGE', value.processingStage),
        progressPercent: value.progressPercent ?? null,
        errorMessage: orNull(value.errorMessage),
        updatedAt: iso(value.updateTime),
    };
}

export function upload(value: filesV1.CreateUploadResponse): Json {
    return {
        file: file(value.file),
        partSizeBytes: value.partSizeBytes,
        parts: value.parts.map((part) => ({ partNumber: part.partNumber, url: part.url })),
        expiresAt: iso(value.urlExpireTime),
    };
}

export function collection(value: collectionsV1.Collection | undefined): Json {
    const c = value ?? collectionsV1.Collection.fromPartial({});
    return {
        id: c.id,
        name: c.name,
        description: orNull(c.description),
        color: orNull(c.color),
        parentId: orNull(c.parentId),
        fileCount: c.fileCount,
        childCount: c.childCount,
        createdAt: iso(c.createTime),
        updatedAt: iso(c.updateTime),
    };
}

export function collectionItem(value: collectionsV1.CollectionItem): Json {
    if (value.item?.$case === 'collection') return { kind: 'collection', collection: collection(value.item.collection) };
    const entry = value.item?.$case === 'file' ? value.item.file : undefined;
    return { kind: 'file', file: file(entry?.file), addedAt: iso(entry?.addTime) };
}

export function hit(value: commonV1.SearchHit): Json {
    const visual = value.visual;
    return {
        fileId: value.fileId,
        fileName: value.fileName,
        fileType: bare('FILE_TYPE', value.fileType),
        sceneId: orNull(value.sceneId),
        sceneNumber: value.sceneNumber ?? null,
        score: Math.min(1, Math.max(0, value.score)),
        startSeconds: value.startSeconds ?? null,
        endSeconds: value.endSeconds ?? null,
        snippet: orNull(value.snippet),
        thumbnailUrl: orNull(value.thumbnailUrl),
        fileUrl: orNull(value.fileUrl),
        youtubeUrl: orNull(value.youtubeUrl),
        visual: visual
            ? {
                  summary: orNull(visual.summary),
                  objects: visual.objects,
                  setting: orNull(visual.setting),
                  style: orNull(visual.style),
                  colors: visual.colors,
              }
            : null,
    };
}

export function conversation(value: chatV1.Conversation | undefined): Json {
    const c = value ?? chatV1.Conversation.fromPartial({});
    return {
        id: c.id,
        title: orNull(c.title),
        fileId: orNull(c.fileId),
        collectionId: orNull(c.collectionId),
        messageCount: c.messageCount,
        lastMessagePreview: orNull(c.lastMessagePreview),
        createdAt: iso(c.createTime),
        updatedAt: iso(c.updateTime),
    };
}

export function message(value: chatV1.Message): Json {
    return {
        id: value.id,
        role: bare('MESSAGE_ROLE', value.role),
        content: value.content,
        hits: value.hits.map(hit),
        fileIds: value.fileIds,
        toolsUsed: value.toolsUsed,
        createdAt: iso(value.createTime),
    };
}

export function chatEvent(value: chatV1.SendMessageResponse): Json | null {
    const event = value.event;
    switch (event?.$case) {
        case 'step':
            return {
                type: 'step',
                step: event.step.step,
                label: event.step.label,
                status: bare('STEP_STATUS', event.step.status),
                error: orNull(event.step.error),
                errorCode: orNull(event.step.errorCode),
            };
        case 'tool':
            return {
                type: 'tool',
                tool: event.tool.tool,
                status: bare('TOOL_STATUS', event.tool.status),
                arguments: event.tool.argumentsJson ? parseObject(event.tool.argumentsJson) : null,
                resultCount: event.tool.resultCount ?? null,
            };
        case 'results':
            return { type: 'results', kind: bare('RESULTS_KIND', event.results.kind), hits: event.results.hits.map(hit) };
        case 'delta':
            return { type: 'delta', text: event.delta.text };
        case 'done':
            return {
                type: 'done',
                messageId: event.done.messageId,
                toolsUsed: event.done.toolsUsed,
                resultCount: event.done.resultCount,
            };
        case 'error':
            return { type: 'error', code: event.error.code, message: event.error.message };
        default:
            return null;
    }
}

function parseObject(text: string): Json | null {
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function plan(value: billingV1.Plan | undefined): Json {
    const p = value ?? billingV1.Plan.fromPartial({});
    return {
        id: p.id,
        name: p.name,
        description: orNull(p.description),
        type: bare('PLAN_TYPE', p.type),
        interval: bare('BILLING_INTERVAL', p.interval),
        price: { amountMinor: p.price?.amountMinor ?? 0, currency: p.price?.currency ?? 'USD' },
        limits: Object.fromEntries(
            p.limits
                .map((limit) => [bare('USAGE_METRIC', limit.metric), limit.limit] as const)
                .filter(([metric]) => metric !== null),
        ),
        features: p.features,
        comparison: bare('PLAN_COMPARISON', p.comparison),
    };
}

export function subscription(value: billingV1.Subscription | undefined): Json {
    const s = value ?? billingV1.Subscription.fromPartial({});
    const change = s.scheduledChange;
    return {
        id: s.id,
        plan: plan(s.plan),
        status: bare('SUBSCRIPTION_STATUS', s.status),
        currentPeriodStart: iso(s.currentPeriodStartTime),
        currentPeriodEnd: iso(s.currentPeriodEndTime),
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        canceledAt: iso(s.cancelTime),
        trialEndsAt: iso(s.trialEndTime),
        scheduledChange: change
            ? {
                  kind: bare('SCHEDULED_CHANGE_KIND', change.kind),
                  planId: change.planId,
                  effectiveAt: iso(change.effectiveTime),
              }
            : null,
        nextPaymentAt: iso(s.nextPaymentTime),
        createdAt: iso(s.createTime),
        updatedAt: iso(s.updateTime),
    };
}

export function usage(value: billingV1.GetUsageResponse, storage: filesV1.GetStorageStatsResponse): Json {
    const storageQuota = value.quotas.find((q) => q.metric === commonV1.UsageMetric.USAGE_METRIC_STORAGE);
    return {
        planType: bare('PLAN_TYPE', value.planType),
        quotas: value.quotas.map((quota) => ({
            metric: bare('USAGE_METRIC', quota.metric),
            used: quota.used,
            limit: quota.limit,
            resetAt: iso(quota.resetTime),
        })),
        storage: { usedBytes: storage.usedBytes, limitBytes: storageQuota?.limit ?? 0, fileCount: storage.fileCount },
    };
}
