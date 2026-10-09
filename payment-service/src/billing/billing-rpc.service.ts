import { BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PlanType } from '@prisma/client';
import {
    billingV1,
    failedPrecondition,
    invalidArgument,
    RpcError,
    Status,
    unauthenticated,
    unavailable,
} from '@ragspace/shared-ts';
import { PlanService } from '../plan/plan.service';
import { PrismaService } from '../prisma/prisma.service';
import { LemonSqueezyService } from '../providers/lemon-squeezy/lemon-squeezy.service';
import { RazorpayService } from '../providers/razorpay/razorpay.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { UsageService } from '../usage/usage.service';
import { WebhookService } from '../webhook/webhook.service';
import { comparePlanTypes, toMetric, toProtoPlan, toProtoQuota, toProtoSubscription } from './billing.mapper';

@Injectable()
export class BillingRpcService implements billingV1.BillingServiceImplementation {
    constructor(
        private readonly prisma: PrismaService,
        private readonly plans: PlanService,
        private readonly subscriptions: SubscriptionService,
        private readonly usage: UsageService,
        private readonly webhooks: WebhookService,
        private readonly lemonSqueezy: LemonSqueezyService,
        private readonly razorpay: RazorpayService,
    ) { }

    async listPlans(request: billingV1.ListPlansRequest): Promise<billingV1.ListPlansResponse> {
        const [plans, current] = await Promise.all([
            this.plans.getAllPlans(),
            request.userId ? this.subscriptions.findCurrentSubscription(request.userId) : null,
        ]);
        const compare = (a: PlanType, b: PlanType) => this.plans.comparePlans(a, b);
        return { plans: plans.map((plan) => toProtoPlan(plan, comparePlanTypes(current?.plan.type, plan.type, compare))) };
    }

    async getSubscription(request: billingV1.GetSubscriptionRequest): Promise<billingV1.GetSubscriptionResponse> {
        return { subscription: toProtoSubscription(await this.subscriptions.ensureSubscription(request.userId)) };
    }

    async changePlan(request: billingV1.ChangePlanRequest): Promise<billingV1.ChangePlanResponse> {
        return translate(async () => {
            const key = request.requestId ? `change-plan:${request.userId}:${request.requestId}` : undefined;
            const replay = key ? await this.prisma.idempotencyKey.findUnique({ where: { key } }) : null;
            if (replay) return billingV1.ChangePlanResponse.decode(Buffer.from((replay.response as { b64: string }).b64, 'base64'));

            const response = await this.applyPlanChange(request);
            if (key) {
                const b64 = Buffer.from(billingV1.ChangePlanResponse.encode(response).finish()).toString('base64');
                await this.prisma.idempotencyKey.create({ data: { key, response: { b64 } } }).catch(() => undefined);
            }
            return response;
        });
    }

    private async applyPlanChange(request: billingV1.ChangePlanRequest): Promise<billingV1.ChangePlanResponse> {
        const target = await this.plans.getPlanById(request.planId);
        const current = await this.subscriptions.ensureSubscription(request.userId);
        if (current.planId === target.id) throw failedPrecondition('Already on this plan');

        if (target.type === PlanType.FREE) {
            await this.subscriptions.cancelSubscription(request.userId, false);
        } else if (!this.subscriptions.hasPaidProviderSubscription(current)) {
            const { checkoutUrl } = await this.subscriptions.createCheckoutSession(request.userId, target.id, request.email);
            return { subscription: toProtoSubscription(current), checkoutUrl };
        } else if (this.plans.isUpgrade(current.plan.type, target.type)) {
            await this.subscriptions.upgradeSubscription(request.userId, target.id);
        } else {
            await this.subscriptions.downgradeSubscription(request.userId, target.id);
        }
        return { subscription: toProtoSubscription(await this.subscriptions.ensureSubscription(request.userId)) };
    }

    async cancelSubscription(request: billingV1.CancelSubscriptionRequest): Promise<billingV1.CancelSubscriptionResponse> {
        return translate(async () => {
            const current = await this.subscriptions.ensureSubscription(request.userId);
            if (current.plan.type === PlanType.FREE) throw failedPrecondition('No paid subscription to cancel');
            await this.subscriptions.cancelSubscription(request.userId, request.immediate);
            return { subscription: toProtoSubscription(await this.subscriptions.ensureSubscription(request.userId)) };
        });
    }

    async pauseSubscription(request: billingV1.PauseSubscriptionRequest): Promise<billingV1.PauseSubscriptionResponse> {
        return translate(async () => {
            const current = await this.subscriptions.ensureSubscription(request.userId);
            if (current.status !== 'PAUSED') await this.subscriptions.pauseSubscription(request.userId);
            return { subscription: toProtoSubscription(await this.subscriptions.ensureSubscription(request.userId)) };
        });
    }

    async resumeSubscription(request: billingV1.ResumeSubscriptionRequest): Promise<billingV1.ResumeSubscriptionResponse> {
        return translate(async () => {
            const current = await this.subscriptions.ensureSubscription(request.userId);
            if (current.status === 'PAUSED') await this.subscriptions.resumeSubscription(request.userId);
            return { subscription: toProtoSubscription(await this.subscriptions.ensureSubscription(request.userId)) };
        });
    }

    async cancelScheduledChange(request: billingV1.CancelScheduledChangeRequest): Promise<billingV1.CancelScheduledChangeResponse> {
        return translate(async () => {
            await this.subscriptions.cancelScheduledChange(request.userId);
            return { subscription: toProtoSubscription(await this.subscriptions.ensureSubscription(request.userId)) };
        });
    }

    async getUsage(request: billingV1.GetUsageRequest): Promise<billingV1.GetUsageResponse> {
        const { planType, quotas } = await this.usage.getQuotas(request.userId);
        return {
            planType: `PLAN_TYPE_${planType}` as billingV1.PlanType,
            quotas: quotas.map(toProtoQuota),
        };
    }

    async consumeQuota(request: billingV1.ConsumeQuotaRequest): Promise<billingV1.ConsumeQuotaResponse> {
        const metric = toMetric(request.metric);
        if (!metric) throw invalidArgument('metric is required');
        if (request.amount <= 0) throw invalidArgument('amount must be positive');
        return this.usage.consume(request.userId, metric, request.amount, request.requestId);
    }

    async releaseQuota(request: billingV1.ReleaseQuotaRequest): Promise<billingV1.ReleaseQuotaResponse> {
        const metric = toMetric(request.metric);
        if (!metric) throw invalidArgument('metric is required');
        if (request.amount <= 0) throw invalidArgument('amount must be positive');
        await this.usage.release(request.userId, metric, request.amount, request.requestId);
        return {};
    }

    async handleWebhook(request: billingV1.HandleWebhookRequest): Promise<billingV1.HandleWebhookResponse> {
        const body = Buffer.from(request.body);
        let payload: any;
        try {
            payload = JSON.parse(body.toString('utf8'));
        } catch {
            throw invalidArgument('Webhook body is not JSON');
        }

        switch (request.provider) {
            case billingV1.PaymentProvider.PAYMENT_PROVIDER_LEMON_SQUEEZY: {
                if (!this.lemonSqueezy.verifyWebhookSignature(request.headers['x-signature'], body)) {
                    throw unauthenticated('Invalid webhook signature');
                }
                const eventType = payload?.meta?.event_name;
                if (!eventType) throw invalidArgument('Missing event type');
                await this.webhooks.processWebhook(eventType, payload);
                break;
            }
            case billingV1.PaymentProvider.PAYMENT_PROVIDER_RAZORPAY: {
                if (!this.razorpay.verifyWebhookSignature(request.headers['x-razorpay-signature'], body)) {
                    throw unauthenticated('Invalid webhook signature');
                }
                const eventType = payload?.event;
                if (!eventType) throw invalidArgument('Missing event type');
                await this.webhooks.processRazorpayWebhook(eventType, payload);
                break;
            }
            default:
                throw invalidArgument('Unknown payment provider');
        }
        return {};
    }
}

async function translate<T>(work: () => Promise<T>): Promise<T> {
    try {
        return await work();
    } catch (error) {
        if (error instanceof NotFoundException) throw new RpcError(Status.NOT_FOUND, 'not_found', error.message);
        if (error instanceof ServiceUnavailableException) throw unavailable(error.message);
        if (error instanceof BadRequestException) throw failedPrecondition(error.message);
        if (error instanceof HttpException) throw failedPrecondition(error.message);
        throw error;
    }
}
