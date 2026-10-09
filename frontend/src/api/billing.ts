import { api, idempotencyKey, unwrap } from './client';

export const billingAPI = {
    plans: async () => (await unwrap(api.GET('/plans'))).items,
    subscription: () => unwrap(api.GET('/subscription')),
    usage: () => unwrap(api.GET('/usage')),
    changePlan: (planId: string) =>
        unwrap(api.POST('/subscription/change-plan', { params: { header: { 'Idempotency-Key': idempotencyKey() } }, body: { planId } })),
    cancel: (immediate = false) => unwrap(api.POST('/subscription/cancel', { body: { immediate } })),
    pause: () => unwrap(api.POST('/subscription/pause')),
    resume: () => unwrap(api.POST('/subscription/resume')),
    cancelScheduledChange: () => unwrap(api.DELETE('/subscription/scheduled-change')),
};
