# Quick Start Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- RabbitMQ (optional, for event-driven features)
- Lemon Squeezy account

## Initial Setup

### 1. Install Dependencies

```bash
cd payment-service
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database - Update with your PostgreSQL credentials
DATABASE_URL="postgresql://user:password@localhost:5432/payment_service?schema=public"

# Service
PORT=3006
NODE_ENV=development

# Lemon Squeezy - Get from https://app.lemonsqueezy.com/settings/api
LEMON_SQUEEZY_API_KEY=your_api_key_here
LEMON_SQUEEZY_STORE_ID=your_store_id_here
LEMON_SQUEEZY_WEBHOOK_SECRET=your_webhook_secret_here

# RabbitMQ (optional)
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=payment.events

# API Gateway
API_GATEWAY_URL=http://localhost:3000
```

### 3. Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed initial plans
npm run prisma:seed
```

### 4. Start Service

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

Service will be running at `http://localhost:3006`

## Lemon Squeezy Setup

### 1. Create Products

1. Go to https://app.lemonsqueezy.com/products
2. Create products for each plan (Free, Basic, Pro, Enterprise)
3. Create variants for different billing periods (monthly/yearly)

### 2. Configure Webhook

1. Go to https://app.lemonsqueezy.com/settings/webhooks
2. Add new webhook: `https://yourdomain.com/api/webhooks/lemon-squeezy`
3. Select all subscription events:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_resumed`
   - `subscription_expired`
   - `subscription_paused`
   - `subscription_unpaused`
   - `subscription_payment_success`
   - `subscription_payment_failed`
   - `order_created`
4. Copy webhook secret to `.env`

### 3. Update Plans with Lemon Squeezy IDs

Run this after creating products:

```typescript
// Update FREE plan
await prisma.plan.update({
  where: { type: 'FREE' },
  data: {
    lemonSqueezyProductId: 'your_product_id',
    lemonSqueezyVariantId: 'your_variant_id',
  },
});

// Repeat for BASIC, PRO, ENTERPRISE
```

Or use the API:

```bash
curl -X PATCH http://localhost:3006/api/plans/PLAN_ID \
  -H "Content-Type: application/json" \
  -d '{
    "lemonSqueezyProductId": "123456",
    "lemonSqueezyVariantId": "789012"
  }'
```

## Testing the Service

### 1. Get All Plans

```bash
curl http://localhost:3006/api/plans
```

### 2. Create Checkout Session

```bash
curl -X POST http://localhost:3006/api/subscriptions/checkout \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-123" \
  -H "x-user-email: user@example.com" \
  -d '{
    "planId": "PLAN_ID"
  }'
```

### 3. Check Usage

```bash
curl http://localhost:3006/api/usage/stats \
  -H "x-user-id: user-123"
```

### 4. Test Webhook (Local Development)

Use ngrok to expose local server:

```bash
ngrok http 3006
```

Update Lemon Squeezy webhook URL with ngrok URL.

## Common Commands

```bash
# Development
npm run start:dev        # Start with hot reload
npm run start:debug      # Start with debugging

# Database
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio GUI
npm run prisma:seed      # Seed database

# Testing
npm test                 # Run unit tests
npm run test:watch       # Run tests in watch mode
npm run test:cov         # Generate coverage report
npm run test:e2e         # Run e2e tests

# Production
npm run build            # Build for production
npm run start:prod       # Start production server

# Code Quality
npm run format           # Format code with Prettier
npm run lint             # Lint code with ESLint
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -d payment_service -U your_user

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Prisma Issues

```bash
# Clear Prisma cache
rm -rf node_modules/.prisma
npm run prisma:generate

# Sync database without migrations
npx prisma db push
```

### Port Already in Use

```bash
# Check what's using port 3006
netstat -ano | findstr :3006  # Windows
lsof -i :3006                 # Mac/Linux

# Kill the process
taskkill /PID <PID> /F        # Windows
kill -9 <PID>                 # Mac/Linux
```

### RabbitMQ Connection Failed

RabbitMQ is optional. If you don't need event-driven features:

1. Comment out RabbitMQ in `.env`
2. Service will run without event publishing

Or install RabbitMQ:

```bash
# Using Docker
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:management

# Or install locally
# Mac: brew install rabbitmq
# Ubuntu: apt-get install rabbitmq-server
# Windows: https://www.rabbitmq.com/download.html
```

## Next Steps

1. ✅ Service is running
2. 📝 Configure Lemon Squeezy products
3. 🔗 Update API Gateway to route to payment service
4. 🎨 Integrate with other services (see INTEGRATION_GUIDE.md)
5. 📊 Set up monitoring and logging
6. 🚀 Deploy to production

## Development Workflow

### Adding a New Usage Metric

1. Update Prisma schema:
```prisma
enum UsageMetricType {
  // ... existing
  MY_NEW_METRIC
}
```

2. Run migration:
```bash
npm run prisma:migrate
```

3. Update plan limits in seed:
```typescript
limits: {
  MY_NEW_METRIC: 100,
}
```

4. Use in decorators:
```typescript
@CheckUsage({ metric: UsageMetricType.MY_NEW_METRIC })
```

### Modifying Plan Limits

```bash
# Open Prisma Studio
npm run prisma:studio

# Or use API
curl -X PATCH http://localhost:3006/api/plans/PLAN_ID \
  -H "Content-Type: application/json" \
  -d '{
    "limits": {
      "CONVERSATIONS": 200,
      "STORAGE": 21474836480
    }
  }'
```

## Support

- 📖 Full documentation: [README.md](README.md)
- 🔗 Integration guide: [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
- 🐛 Issues: Check logs at `logs/` directory
- 💬 Questions: Contact dev team

## Health Check

```bash
# Check service health
curl http://localhost:3006/health

# Check database connection
npm run prisma:studio
```

If everything is working, you should see plan data in Prisma Studio!
