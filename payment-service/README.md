# payment-service

Plans, subscriptions and usage quotas.

- **gRPC**: `BillingService` (`contracts/proto/ragspace/billing/v1`). `ChangePlan` is the single entry for checkout, upgrade and downgrade; `ConsumeQuota` / `ReleaseQuota` are atomic and idempotent per `request_id`.
- **Webhooks**: the gateway forwards provider callbacks to `HandleWebhook` with the raw body, and the signature is verified here (Lemon Squeezy, Razorpay).
- **Events consumed**: `user.created` (free subscription), `user.deleted` (purge).
- **Jobs**: monthly quota reset, scheduled plan changes, idempotency-key expiry.

```bash
npm test
npx prisma migrate dev --schema src/prisma/schema.prisma
```
