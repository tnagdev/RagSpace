# Payment Service Integration - Correct Architecture

## Architecture Overview

The payment client belongs in **each service that needs to validate quotas**, NOT in the payment service itself. The payment service is a pure API service that other services call.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          API Gateway                                │
│  - Validates sessions with auth-service                            │
│  - Forwards x-user + x-session headers to downstream services      │
└────────────┬────────────────────────────────────────────────────────┘
             │
             ├──────────────────┬──────────────────┬──────────────────┐
             │                  │                  │                  │
             ↓                  ↓                  ↓                  ↓
┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Upload Manager     │ │  Chat Manager   │ │ Scene Detector  │ │ Payment Service │
│  (NestJS)           │ │  (FastAPI)      │ │  (FastAPI)      │ │  (NestJS)       │
├─────────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ ✅ Payment Client   │ │ ✅ Payment Client│ │ ✅ Payment Client│ │ ❌ NO CLIENT    │
│ ✅ QuotaGuard       │ │ ✅ @check_quota │ │ ✅ @check_quota │ │ Pure API        │
│ ✅ PlanGuard        │ │ ✅ @require_plan│ │ ✅ @require_plan│ │                 │
│ ✅ @CheckQuota()    │ │                  │ │                  │ │ Endpoints:      │
│ ✅ @RequirePlan()   │ │                  │ │                  │ │ - /api/usage/*  │
│                     │ │                  │ │                  │ │ - /api/plans/*  │
│ Calls Payment API → │ │ Calls Payment →  │ │ Calls Payment →  │ │ - /api/subs/*   │
└─────────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Why This Architecture?

### ❌ Wrong: Payment Client in Payment Service
- Payment service would call itself (circular)
- Defeats the purpose of a client
- Client code has no service to call

### ✅ Correct: Payment Client in Consumer Services
- Each service that needs quota validation has its own client
- Payment service is a pure API (like auth-service)
- Services call payment service via HTTP
- Clean separation of concerns

## File Structure

### Payment Service (Pure API)
```
payment-service/
├── src/
│   ├── plan/              # Plan management
│   ├── subscription/      # Subscription CRUD
│   ├── usage/             # Usage tracking & validation
│   ├── validation/        # Plan tier validation
│   └── webhook/           # Lemon Squeezy webhooks
├── prisma/
│   └── schema.prisma      # Database schema
└── README.md
```

**NO CLIENT CODE HERE!**

### Upload Manager (Consumer Service - NestJS)
```
upload-manager/
├── src/
│   ├── common/
│   │   └── payment/                    # ✅ Payment client HERE
│   │       ├── payment-client.service.ts
│   │       ├── quota.guard.ts
│   │       ├── plan.guard.ts
│   │       ├── quota.decorator.ts
│   │       ├── usage-tracking.interceptor.ts
│   │       ├── payment.module.ts
│   │       └── index.ts
│   └── modules/
│       └── upload/
│           └── upload.controller.ts    # Uses @CheckQuota()
└── PAYMENT_INTEGRATION.md
```

### Chat Manager (Consumer Service - Python/FastAPI)
```
chat-manager/
├── src/
│   ├── common/
│   │   └── payment_client.py          # ✅ Payment client HERE
│   │       # Contains:
│   │       # - PaymentClient class
│   │       # - @check_quota decorator
│   │       # - @require_plan decorator
│   └── routers/
│       └── chat.py                    # Uses @check_quota()
└── PAYMENT_INTEGRATION.md
```

## Integration Patterns

### NestJS Services (Upload Manager, API Gateway)

**1. Copy Payment Module**
```bash
# Create directory structure
mkdir -p upload-manager/src/common/payment

# Copy files from project root (not from payment-service!)
# Files are standalone - no dependency on payment-service code
```

**2. Import Module**
```typescript
// app.module.ts
import { PaymentModule } from './common/payment';

@Module({
  imports: [
    PaymentModule,  // Registers guards & interceptors globally
    // ... other imports
  ],
})
export class AppModule {}
```

**3. Use Decorators**
```typescript
@Controller('upload')
export class UploadController {
  @Post()
  @CheckQuota({
    metric: UsageMetricType.STORAGE,
    getAmount: (req) => req.file.size
  })
  async upload(@UploadedFile() file: Express.Multer.File) {
    // Automatic quota check before handler
    // Automatic usage tracking after success
    return this.uploadService.upload(file);
  }
}
```

### Python/FastAPI Services (Chat Manager, Scene Detector, File Embedder)

**1. Copy Payment Client**
```bash
# Copy the standalone Python file
cp chat-manager/src/common/payment_client.py scene-detector/src/common/
```

**2. Initialize in main.py**
```python
from src.common.payment_client import init_payment_client

init_payment_client(
    base_url=os.getenv("PAYMENT_SERVICE_URL"),
    service_name="chat-manager",
)
```

**3. Use Decorators**
```python
from src.common.payment_client import check_quota, UsageMetricType

@router.post("/conversations")
@check_quota(UsageMetricType.CONVERSATIONS, amount=1)
async def create_conversation(request: Request):
    # Automatic quota check before handler
    # Automatic usage tracking after success
    conversation = await service.create()
    return conversation
```

## Request Flow Example

```
1. Client → API Gateway
   POST /api/upload (with session cookie)

2. API Gateway → Auth Service
   POST /auth/session (validate session)
   
3. Auth Service → API Gateway
   { user: {...}, session: {...} }

4. API Gateway → Upload Manager
   POST /api/upload
   Headers:
     x-user: {"id": "123", "email": "user@example.com", ...}
     x-session: {"id": "sess_123", "expiresAt": "2026-02-10T...", ...}

5. Upload Manager - QuotaGuard (Before Handler)
   - Parses x-user header → Gets user.id = "123"
   - Calls Payment Service:
     POST http://payment-service:3006/api/usage/check
     Headers:
       x-user: {"id": "123"}
       x-service: "upload-manager"
     Body:
       { metric: "STORAGE", amount: 5242880 }
   - Payment Service responds: { allowed: true, remaining: 9999, limit: 10737418240 }
   - QuotaGuard: ✅ Allowed, continue to handler

6. Upload Manager - Handler
   - Uploads file to S3
   - Returns success response

7. Upload Manager - UsageTrackingInterceptor (After Handler)
   - Calls Payment Service:
     POST http://payment-service:3006/api/usage/track
     Headers:
       x-user: {"id": "123"}
       x-service: "upload-manager"
     Body:
       { metric: "STORAGE", amount: 5242880, metadata: {...} }
   - Tracking succeeds (or fails silently)

8. Upload Manager → Client
   { success: true, fileUrl: "..." }
```

## Key Differences from Previous Architecture

| Aspect | ❌ Previous (Wrong) | ✅ Corrected |
|--------|---------------------|--------------|
| Client Location | payment-service/src/common/client/ | upload-manager/src/common/payment/ |
| Who has client? | Payment service (called itself) | Consumer services (call payment service) |
| Integration | Copy from payment-service | Standalone client per service |
| Guard/Decorator | In payment service (unused) | In each consumer service |
| Usage | Manual service injection | Automatic via decorators |

## Environment Variables

### Payment Service
```env
DATABASE_URL=postgresql://...
LEMON_SQUEEZY_API_KEY=...
LEMON_SQUEEZY_STORE_ID=...
RABBITMQ_URL=amqp://...
PORT=3006
```

### Consumer Services (Upload, Chat, Scene, Embedder)
```env
PAYMENT_SERVICE_URL=http://localhost:3006  # or payment-service:3006 in Docker
SERVICE_NAME=upload-manager               # Unique per service
```

## Deployment

### Docker Compose Example
```yaml
services:
  payment-service:
    build: ./payment-service
    ports:
      - "3006:3006"
    environment:
      - DATABASE_URL=${PAYMENT_DB_URL}
      - LEMON_SQUEEZY_API_KEY=${LS_API_KEY}

  upload-manager:
    build: ./upload-manager
    ports:
      - "3002:3002"
    environment:
      - PAYMENT_SERVICE_URL=http://payment-service:3006
      - SERVICE_NAME=upload-manager
    depends_on:
      - payment-service

  chat-manager:
    build: ./chat-manager
    ports:
      - "3005:3005"
    environment:
      - PAYMENT_SERVICE_URL=http://payment-service:3006
      - SERVICE_NAME=chat-manager
    depends_on:
      - payment-service
```

## Testing Strategy

### Unit Tests - Consumer Services
Mock the payment client:

```typescript
// NestJS
const mockPaymentClient = {
  checkUsage: jest.fn().mockResolvedValue({ allowed: true }),
  trackUsage: jest.fn().mockResolvedValue(undefined),
};
```

```python
# Python
@patch('src.common.payment_client.get_payment_client')
def test_endpoint(mock_client):
    mock_client.return_value.check_usage = AsyncMock(
        return_value=UsageCheckResult(allowed=True)
    )
```

### Integration Tests
Use real payment service or mock HTTP responses:

```typescript
nock('http://localhost:3006')
  .post('/api/usage/check')
  .reply(200, { allowed: true, remaining: 1000 });
```

### E2E Tests
Full stack with all services running.

## Migration from Previous Architecture

### Step 1: Remove Client from Payment Service ✅ DONE
```bash
# These files should be deleted:
rm -rf payment-service/src/common/client/
```

### Step 2: Install Client in Upload Manager ✅ DONE
Already created in `upload-manager/src/common/payment/`

### Step 3: Install Client in Chat Manager ✅ DONE
Already created in `chat-manager/src/common/payment_client.py`

### Step 4: Install Client in Scene Detector (TODO)
Copy from chat-manager (same Python code)

### Step 5: Install Client in File Embedder (TODO)
Copy from chat-manager (same Python code)

## Next Steps

1. ✅ Upload Manager - Client installed, ready to use
2. ✅ Chat Manager - Client installed, ready to use
3. ⏳ Scene Detector - Copy payment_client.py from chat-manager
4. ⏳ File Embedder - Copy payment_client.py from chat-manager
5. ⏳ Update controllers/routers with @CheckQuota() decorators
6. ⏳ Test quota enforcement end-to-end
7. ⏳ Deploy and monitor

## Documentation by Service

- [Upload Manager Integration](../upload-manager/PAYMENT_INTEGRATION.md)
- [Chat Manager Integration](../chat-manager/PAYMENT_INTEGRATION.md)
- [Payment Service API](../payment-service/README.md)

## Summary

**Payment Service = Pure API Server**
- Stores plans, subscriptions, usage in database
- Exposes REST endpoints for quota checking and tracking
- No client code, no decorators for other services

**Consumer Services = Client + Decorators**
- Each has its own payment client
- Clients call payment service via HTTP
- Use decorators (@CheckQuota, @RequirePlan) for automatic validation
- Guards/interceptors handle quota checking and tracking

This is the standard microservices pattern where:
- Auth service = API (other services call it)
- Payment service = API (other services call it)
- Consumer services = Have clients to call Auth & Payment
