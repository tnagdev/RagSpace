export const PaymentEndpoints = {
  // Subscriptions
  CREATE_FREE_SUBSCRIPTION: '/api/subscriptions/free',
  GET_SUBSCRIPTION_STATUS:  '/api/subscriptions/status',

  // Usage quota
  CHECK_USAGE:     '/api/usage/check',
  TRACK_USAGE:     '/api/usage/track',
  DECREMENT_USAGE: '/api/usage/decrement',
  REMAINING_QUOTA: '/api/usage/remaining',
  USAGE_STATS:     '/api/usage/stats',

  // Plan validation
  VALIDATE_PLAN: '/api/validation/plan-type',
} as const;

export type PaymentEndpointKey = keyof typeof PaymentEndpoints;
