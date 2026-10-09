import { Provider } from '@nestjs/common';
import { billingV1, createRpcClient, RpcClient } from '@ragspace/shared-ts';

export const BILLING_CLIENT = Symbol('BILLING_CLIENT');

export type BillingClient = RpcClient<typeof billingV1.BillingServiceDefinition>;

export const billingClientProvider: Provider = {
    provide: BILLING_CLIENT,
    useFactory: (): BillingClient =>
        createRpcClient(billingV1.BillingServiceDefinition, {
            address: process.env.BILLING_GRPC_ADDRESS || 'payment-service:50051',
            caller: 'upload-manager',
            deadlineMs: 3_000,
        }),
};
