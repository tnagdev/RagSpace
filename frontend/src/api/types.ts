import type { components } from './schema';

type Schemas = components['schemas'];

export type User = Schemas['User'];
export type FileType = Schemas['FileType'];
export type UploadStatus = Schemas['UploadStatus'];
export type ProcessingStatus = Schemas['ProcessingStatus'];
export type ProcessingStage = Schemas['ProcessingStage'];
export type ApiFile = Schemas['File'];
export type FileState = Schemas['FileState'];
export type Upload = Schemas['Upload'];
export type Collection = Schemas['Collection'];
export type CollectionItem = Schemas['CollectionItem'];
export type DeleteCollectionResult = Schemas['DeleteCollectionResult'];
export type SearchHit = Schemas['SearchHit'];
export type VisualDescription = Schemas['VisualDescription'];
export type Conversation = Schemas['Conversation'];
export type Message = Schemas['Message'];
export type ChatStreamEvent = Schemas['ChatStreamEvent'];
export type UserEvent = Schemas['UserEvent'];
export type Plan = Schemas['Plan'];
export type PlanType = Schemas['PlanType'];
export type Subscription = Schemas['Subscription'];
export type ChangePlanResult = Schemas['ChangePlanResult'];
export type Usage = Schemas['Usage'];
export type QuotaUsage = Schemas['QuotaUsage'];
export type UsageMetric = Schemas['UsageMetric'];

export interface Page<T> {
    items: T[];
    nextCursor: string | null;
}
