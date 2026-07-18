// Generated — interfaces & enums from JSON Schema contracts
export type { AuthUser }              from './generated/AuthUser';
export type { AuthSession }           from './generated/AuthSession';
export type { UploadedFile }          from './generated/UploadedFile';
export type { Scene }                 from './generated/Scene';
export type { UsageCheckResult }      from './generated/UsageCheckResult';
export type { PlanValidationResult }  from './generated/PlanValidationResult';

export { FileType }         from './generated/enums/FileType';
export { EventType }        from './generated/enums/EventType';
export { ProcessingStatus } from './generated/enums/ProcessingStatus';
export { ProcessingStage }  from './generated/enums/ProcessingStage';
export { ServiceStatus }    from './generated/enums/ServiceStatus';
export { UsageMetricType }  from './generated/enums/UsageMetricType';

export type { UploadCompletedEvent }    from './generated/events/UploadCompletedEvent';
export type { ProcessingCompletedEvent } from './generated/events/ProcessingCompletedEvent';
export type { FileDeletedEvent }         from './generated/events/FileDeletedEvent';

export type { UpdateFileStatusParams } from './generated/events/UpdateFileStatusParams';

// Hand-written infrastructure
export { BaseHttpClient }   from './http/base-http-client';
export { PaymentEndpoints } from './payment/payment-endpoints';
export type { PaymentEndpointKey } from './payment/payment-endpoints';
