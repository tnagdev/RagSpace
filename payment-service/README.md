# Payment Service

**Pure API microservice** for managing subscriptions, payments, and usage limits using Lemon Squeezy.

> ⚠️ **Note**: This service is a pure API server. Payment clients for consuming this API are located in each service that needs quota validation (upload-manager, chat-manager, etc.). See [PAYMENT_ARCHITECTURE.md](../PAYMENT_ARCHITECTURE.md) for integration guide.

## Architecture

```
Payment Service (this service)          Consumer Services
┌─────────────────────┐                ┌──────────────────────┐
│  Pure API Server    │◄───────────────│  Upload Manager      │
│                     │                │  ✅ Has Payment Client│
│  Endpoints:         │◄───────────────│  Chat Manager        │
│  - /api/usage/*     │                │  ✅ Has Payment Client│
│  - /api/plans/*     │◄───────────────│  Scene Detector      │
│  - /api/subs/*      │                │  ✅ Has Payment Client│
│  - /api/validation/*│                └──────────────────────┘
│                     │
│  ❌ NO CLIENT CODE  │
└─────────────────────┘
```

## Features

- 🔐 **Subscription Management**: Create, upgrade, downgrade, pause, resume, and cancel subscriptions
- 💳 **Payment Processing**: Lemon Squeezy integration for payment handling
- 📊 **Usage Tracking**: Track and enforce usage limits across multiple metrics
- 🎫 **Plan Management**: Flexible plan configuration with customizable limits
- 🔄 **Event-Driven**: RabbitMQ integration for cross-service communication
- 🪝 **Webhooks**: Automatic sync with Lemon Squeezy events

## Usage Metrics

The service tracks and enforces limits on:

- `CONVERSATIONS`: Number of chat conversations
- `STORAGE`: Storage usage in bytes
- `FILE_CONVERSATIONS`: Per-file conversation limits
- `YOUTUBE_VIDEOS`: Number of YouTube videos
- `EMBEDDINGS`: Number of embeddings generated
- `MAX_VIDEO_LENGTH`: Maximum video length in seconds

## Plans

### Default Plan Structure

```typescript
{
  FREE: {
    price: $0/month,
    conversations: 10,
    storage: 1GB,
    file_conversations: 5,
    youtube_videos: 3,
    max_video_length: 600 // 10 minutes
  },
  BASIC: {
    price: $19/month,
    conversations: 100,
    storage: 10GB,
    file_conversations: 50,
    youtube_videos: 25,
    max_video_length: 3600 // 60 minutes
  },
  PRO: {
    price: $49/month,
    conversations: 0, // unlimited
    storage: 100GB,
    file_conversations: 0, // unlimited
    youtube_videos: 0, // unlimited
    max_video_length: 0 // unlimited
  }
}
```

## API Endpoints

### Plans

- `GET /api/plans` - List all active plans
- `GET /api/plans/:id` - Get plan details
- `POST /api/plans` - Create new plan (admin)
- `PATCH /api/plans/:id` - Update plan (admin)

### Subscriptions

- `GET /api/subscriptions/current` - Get user's current subscription
- `GET /api/subscriptions/usage` - Get usage statistics
- `POST /api/subscriptions/checkout` - Create checkout session
- `PATCH /api/subscriptions/upgrade` - Upgrade plan
- `PATCH /api/subscriptions/downgrade` - Downgrade plan
- `DELETE /api/subscriptions/cancel` - Cancel subscription
- `PATCH /api/subscriptions/pause` - Pause subscription
- `PATCH /api/subscriptions/resume` - Resume subscription

### Usage

- `GET /api/usage/stats` - Get usage statistics
- `GET /api/usage/history` - Get usage history
- `POST /api/usage/check` - Check if usage available
- `GET /api/usage/remaining` - Get remaining quota

### Validation

- `GET /api/validation/plan-type` - Get user's plan type
- `GET /api/validation/features` - Get active features
- `POST /api/validation/feature` - Check feature access
- `POST /api/validation/bulk` - Validate bulk users

### Webhooks

- `POST /api/webhooks/lemon-squeezy` - Lemon Squeezy webhook handler

## Using Decorators in Other Services

### 1. Check Plan Requirements

```typescript
import { RequirePlan } from 'payment-service/decorators';
import { UsageMetricType } from '@prisma/client';

@RequirePlan({
  minPlanType: 'PRO',
  metrics: [UsageMetricType.CONVERSATIONS],
  allowTrial: true
})
@Post('/upload')
async uploadFile() {
  // Only PRO+ users can access
}
```

### 2. Track and Enforce Usage

```typescript
import { CheckUsage } from 'payment-service/decorators';
import { UsageMetricType } from '@prisma/client';

@CheckUsage({
  metric: UsageMetricType.FILE_CHATS,
  amount: 1
})
@Post('/chat')
async createChat() {
  // Automatically checks and tracks usage
}
```

### 3. Manual Usage Tracking

```typescript
// In your service
constructor(
  @Inject('PAYMENT_SERVICE_URL') private paymentService: string,
  private httpService: HttpService
) {}

async trackUsage(userId: string, metric: UsageMetricType, amount: number) {
  await this.httpService.post(
    `${this.paymentService}/api/usage/track`,
    { userId, metric, amount }
  ).toPromise();
}
```

### 4. Check Feature Access

```typescript
async checkFeature(userId: string, feature: string): Promise<boolean> {
  const response = await this.httpService.post(
    `${this.paymentService}/api/validation/feature`,
    { feature },
    { headers: { 'x-user-id': userId } }
  ).toPromise();
  
  return response.data.hasAccess;
}
```

## Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed initial plans (optional)
npm run prisma:seed
```

## Development

```bash
# Development mode
npm run start:dev

# Production build
npm run build
npm run start:prod
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/payment_service

# Service
PORT=3006
NODE_ENV=development

# Lemon Squeezy
LEMON_SQUEEZY_API_KEY=your_api_key
LEMON_SQUEEZY_STORE_ID=your_store_id
LEMON_SQUEEZY_WEBHOOK_SECRET=your_webhook_secret

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=payment.events

# API Gateway
API_GATEWAY_URL=http://localhost:3000
```

## Lemon Squeezy Setup

1. Create products in Lemon Squeezy dashboard
2. Create variants for different plans
3. Configure webhook URL: `https://yourdomain.com/api/webhooks/lemon-squeezy`
4. Copy webhook secret to `.env`
5. Update plans with Lemon Squeezy IDs

## Events Published

The service publishes these events via RabbitMQ:

- `subscription.created` - New subscription created
- `subscription.upgraded` - Plan upgraded
- `subscription.downgraded` - Plan downgraded
- `subscription.cancelled` - Subscription cancelled
- `subscription.cancel_scheduled` - Cancel scheduled at period end
- `subscription.expired` - Subscription expired
- `subscription.payment_failed` - Payment failed

## Database Schema

### Plans
- Flexible JSON limits for easy modification
- Lemon Squeezy integration fields
- Feature flags

### Subscriptions
- Status tracking (ACTIVE, CANCELLED, EXPIRED, etc.)
- Period management
- Usage quotas

### Usage Tracking
- Real-time usage records
- Quota enforcement
- Historical data

## Adding New Usage Metrics

1. Add metric to `UsageMetricType` enum in `prisma/schema.prisma`:
```prisma
enum UsageMetricType {
  // ... existing metrics
  NEW_METRIC
}
```

2. Run migration:
```bash
npx prisma migrate dev --name add-new-metric
```

3. Update plan limits:
```typescript
await planService.updatePlan(planId, {
  limits: {
    ...existingLimits,
    NEW_METRIC: 100
  }
});
```

4. Use in decorators:
```typescript
@CheckUsage({ metric: UsageMetricType.NEW_METRIC })
@Post('/endpoint')
async handler() {}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Payment Service                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Plans      │  │ Subscriptions│  │    Usage     │      │
│  │  Management  │  │  Management  │  │   Tracking   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Validation  │  │   Webhooks   │  │   Guards &   │      │
│  │   Service    │  │   Handler    │  │  Decorators  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                    External Integrations                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │LemonSqueezy  │  │  PostgreSQL  │  │  RabbitMQ    │      │
│  │    API       │  │   Database   │  │Event Stream  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Always use decorators** for plan/usage validation in other services
2. **Track usage immediately** after successful operations
3. **Handle webhook retries** - Lemon Squeezy may send duplicates
4. **Test plan changes** in development before production
5. **Monitor usage patterns** to optimize limits
6. **Set up alerting** for payment failures

## Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Production Checklist

- [ ] Configure Lemon Squeezy webhook URL
- [ ] Set up production database
- [ ] Configure RabbitMQ connection
- [ ] Set environment variables
- [ ] Run migrations
- [ ] Seed initial plans
- [ ] Test webhook delivery
- [ ] Monitor payment events
- [ ] Set up error alerting

## Support

For issues or questions, check the logs or contact the development team.
