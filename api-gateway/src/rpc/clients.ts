import { Global, Module } from '@nestjs/common';
import {
    RpcClient,
    authV1,
    billingV1,
    chatV1,
    collectionsV1,
    createRpcClient,
    filesV1,
    searchV1,
} from '@ragspace/shared-ts';
import { config } from '../config';

export const AUTH = 'AUTH_CLIENT';
export const FILES = 'FILES_CLIENT';
export const COLLECTIONS = 'COLLECTIONS_CLIENT';
export const SEARCH = 'SEARCH_CLIENT';
export const CHAT = 'CHAT_CLIENT';
export const BILLING = 'BILLING_CLIENT';

export type AuthClient = RpcClient<typeof authV1.AuthServiceDefinition>;
export type FilesClient = RpcClient<typeof filesV1.FileServiceDefinition>;
export type CollectionsClient = RpcClient<typeof collectionsV1.CollectionServiceDefinition>;
export type SearchClient = RpcClient<typeof searchV1.SearchServiceDefinition>;
export type ChatClient = RpcClient<typeof chatV1.ChatServiceDefinition>;
export type BillingClient = RpcClient<typeof billingV1.BillingServiceDefinition>;

const caller = 'api-gateway';

// Deadlines follow how long each dependency legitimately takes: chat waits on the model.
const providers = [
    { provide: AUTH, useFactory: () => createRpcClient(authV1.AuthServiceDefinition, { address: config.grpc.auth, caller, deadlineMs: 5_000 }) },
    { provide: FILES, useFactory: () => createRpcClient(filesV1.FileServiceDefinition, { address: config.grpc.files, caller, deadlineMs: 30_000 }) },
    { provide: COLLECTIONS, useFactory: () => createRpcClient(collectionsV1.CollectionServiceDefinition, { address: config.grpc.files, caller, deadlineMs: 10_000 }) },
    { provide: SEARCH, useFactory: () => createRpcClient(searchV1.SearchServiceDefinition, { address: config.grpc.search, caller, deadlineMs: 60_000 }) },
    { provide: CHAT, useFactory: () => createRpcClient(chatV1.ChatServiceDefinition, { address: config.grpc.chat, caller, deadlineMs: 120_000 }) },
    { provide: BILLING, useFactory: () => createRpcClient(billingV1.BillingServiceDefinition, { address: config.grpc.billing, caller, deadlineMs: 5_000 }) },
];

@Global()
@Module({ providers, exports: providers.map((p) => p.provide) })
export class RpcModule {}
