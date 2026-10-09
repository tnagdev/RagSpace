import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PlanType } from '@prisma/client';
import { billingV1, commonV1, Status } from '@ragspace/shared-ts';
import { BillingRpcService } from './billing-rpc.service';

const plan = (id: string, type: PlanType) => ({
    id,
    name: type,
    description: null,
    type,
    interval: 'MONTHLY',
    price: type === PlanType.FREE ? 0 : 10,
    priceUnit: 'USD',
    limits: { CONVERSATIONS: 10 },
    features: [],
    createdAt: new Date(),
    updatedAt: new Date(),
});

const subscription = (planType: PlanType) => ({
    id: 'sub-1',
    userId: 'u1',
    planId: `plan-${planType}`,
    plan: plan(`plan-${planType}`, planType),
    status: 'ACTIVE',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    trialEnd: null,
    scheduledChangeType: null,
    scheduledPlanId: null,
    scheduledChangeAt: null,
    nextPaymentDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
});

describe('BillingRpcService', () => {
    const order = [PlanType.FREE, PlanType.BASIC, PlanType.PRO];
    let plans: any;
    let subscriptions: any;
    let lemon: any;
    let webhooks: any;
    let service: BillingRpcService;

    beforeEach(() => {
        plans = {
            getPlanById: jest.fn(async (id: string) => plan(id, id.replace('plan-', '') as PlanType)),
            isUpgrade: (a: PlanType, b: PlanType) => order.indexOf(b) > order.indexOf(a),
            comparePlans: (a: PlanType, b: PlanType) => order.indexOf(a) - order.indexOf(b),
            getAllPlans: jest.fn(),
        };
        subscriptions = {
            ensureSubscription: jest.fn(),
            hasPaidProviderSubscription: jest.fn(),
            createCheckoutSession: jest.fn(),
            upgradeSubscription: jest.fn(),
            downgradeSubscription: jest.fn(),
            cancelSubscription: jest.fn(),
            cancelScheduledChange: jest.fn(),
        };
        lemon = { verifyWebhookSignature: jest.fn() };
        webhooks = { processWebhook: jest.fn() };
        service = new BillingRpcService(
            { idempotencyKey: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}) } } as any,
            plans,
            subscriptions,
            {} as any,
            webhooks,
            lemon,
            {} as any,
        );
    });

    it('sends a free user to checkout instead of changing the plan', async () => {
        subscriptions.ensureSubscription.mockResolvedValue(subscription(PlanType.FREE));
        subscriptions.hasPaidProviderSubscription.mockReturnValue(false);
        subscriptions.createCheckoutSession.mockResolvedValue({ checkoutUrl: 'https://pay.example/x' });

        const result = await service.changePlan({ userId: 'u1', planId: 'plan-PRO', requestId: '', email: 'a@b.co' });

        expect(result.checkoutUrl).toBe('https://pay.example/x');
        expect(subscriptions.createCheckoutSession).toHaveBeenCalledWith('u1', 'plan-PRO', 'a@b.co');
        expect(subscriptions.upgradeSubscription).not.toHaveBeenCalled();
    });

    it('upgrades and downgrades paid subscriptions in place', async () => {
        subscriptions.ensureSubscription.mockResolvedValue(subscription(PlanType.BASIC));
        subscriptions.hasPaidProviderSubscription.mockReturnValue(true);

        await service.changePlan({ userId: 'u1', planId: 'plan-PRO', requestId: '', email: '' });
        expect(subscriptions.upgradeSubscription).toHaveBeenCalledWith('u1', 'plan-PRO');

        subscriptions.ensureSubscription.mockResolvedValue(subscription(PlanType.PRO));
        await service.changePlan({ userId: 'u1', planId: 'plan-BASIC', requestId: '', email: '' });
        expect(subscriptions.downgradeSubscription).toHaveBeenCalledWith('u1', 'plan-BASIC');
    });

    it('moving to FREE cancels at period end', async () => {
        subscriptions.ensureSubscription.mockResolvedValue(subscription(PlanType.PRO));
        await service.changePlan({ userId: 'u1', planId: 'plan-FREE', requestId: '', email: '' });
        expect(subscriptions.cancelSubscription).toHaveBeenCalledWith('u1', false);
    });

    it('rejects a change to the current plan', async () => {
        subscriptions.ensureSubscription.mockResolvedValue(subscription(PlanType.BASIC));
        await expect(
            service.changePlan({ userId: 'u1', planId: 'plan-BASIC', requestId: '', email: '' }),
        ).rejects.toMatchObject({ code: Status.FAILED_PRECONDITION });
    });

    it('maps an unconfigured provider to UNAVAILABLE and missing records to NOT_FOUND', async () => {
        subscriptions.ensureSubscription.mockResolvedValue(subscription(PlanType.FREE));
        subscriptions.hasPaidProviderSubscription.mockReturnValue(false);
        subscriptions.createCheckoutSession.mockRejectedValue(new ServiceUnavailableException('not configured'));
        await expect(
            service.changePlan({ userId: 'u1', planId: 'plan-PRO', requestId: '', email: '' }),
        ).rejects.toMatchObject({ code: Status.UNAVAILABLE });

        subscriptions.cancelScheduledChange.mockRejectedValue(new NotFoundException('No scheduled change found'));
        await expect(service.cancelScheduledChange({ userId: 'u1' })).rejects.toMatchObject({
            code: Status.NOT_FOUND,
            details: 'No scheduled change found',
        });
    });

    it('rejects webhooks with a bad signature before processing', async () => {
        lemon.verifyWebhookSignature.mockReturnValue(false);
        await expect(
            service.handleWebhook({
                provider: billingV1.PaymentProvider.PAYMENT_PROVIDER_LEMON_SQUEEZY,
                body: Buffer.from(JSON.stringify({ meta: { event_name: 'subscription_created' } })),
                headers: { 'x-signature': 'nope' },
            }),
        ).rejects.toMatchObject({ code: Status.UNAUTHENTICATED });
        expect(webhooks.processWebhook).not.toHaveBeenCalled();
    });

    it('validates quota requests', async () => {
        await expect(
            service.consumeQuota({ userId: 'u1', metric: commonV1.UsageMetric.USAGE_METRIC_UNSPECIFIED, amount: 1, requestId: '' }),
        ).rejects.toMatchObject({ code: Status.INVALID_ARGUMENT });
        await expect(
            service.consumeQuota({ userId: 'u1', metric: commonV1.UsageMetric.USAGE_METRIC_STORAGE, amount: 0, requestId: '' }),
        ).rejects.toMatchObject({ code: Status.INVALID_ARGUMENT });
    });
});
