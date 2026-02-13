# Payment Integration - Implementation Summary

## What Was Fixed

### ❌ Previous Architecture (Incorrect)
- Payment client was in `payment-service/src/common/client/`
- Payment service had guards and decorators for OTHER services to use
- Circular dependency: payment service calling itself
- Violated microservices principles

### ✅ Corrected Architecture
- Payment service is a **pure API server** (like auth-service)
- Payment **clients** are in **consumer services** (upload-manager, chat-manager, etc.)
- Each service has its own client to call the payment service
- Clean separation: payment service = API, consumer services = clients

## What Was Created

### 1. Upload Manager (NestJS) - `/upload-manager/src/common/payment/`
- ✅ `payment-client.service.ts` - HTTP client to call payment service
- ✅ `quota.guard.ts` - Guard that checks quotas before routes execute
- ✅ `plan.guard.ts` - Guard that validates plan tier requirements
- ✅ `quota.decorator.ts` - `@CheckQuota()` and `@RequirePlan()` decorators
- ✅ `usage-tracking.interceptor.ts` - Auto-tracks usage after successful operations
- ✅ `payment.module.ts` - Module that registers everything globally
- ✅ `index.ts` - Clean exports

**Integration:** Already added to `app.module.ts`

### 2. Chat Manager (Python/FastAPI) - `/chat-manager/src/common/`
- ✅ `payment_client.py` - Complete Python client with decorators
  - `PaymentClient` class with async HTTP client
  - `@check_quota()` decorator - Checks quotas + auto-tracks
  - `@require_plan()` decorator - Validates plan tier
  - `get_payment_client()` - Get singleton instance
  - `init_payment_client()` - Initialize on startup

**Integration:** Add initialization to `main.py`

### 3. Documentation
- ✅ [PAYMENT_ARCHITECTURE.md](./PAYMENT_ARCHITECTURE.md) - Complete architecture guide
- ✅ [upload-manager/PAYMENT_INTEGRATION.md](./upload-manager/PAYMENT_INTEGRATION.md) - NestJS integration
- ✅ [chat-manager/PAYMENT_INTEGRATION.md](./chat-manager/PAYMENT_INTEGRATION.md) - Python integration

### 4. Payment Service Cleanup
- ✅ Removed `/src/common/client/` directory (didn't belong there)
- ✅ Removed outdated integration docs
- ✅ Updated README with architecture note

## Usage Examples

### NestJS (Upload Manager)

```typescript
import { Controller, Post } from '@nestjs/common';
import { CheckQuota, RequirePlan, UsageMetricType } from '../common/payment';

@Controller('upload')
export class UploadController {
  // Automatic quota check + tracking
  @Post()
  @CheckQuota({
    metric: UsageMetricType.STORAGE,
    getAmount: (req) => req.file.size
  })
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.upload(file);
  }

  // Premium feature with plan check
  @Post('youtube')
  @RequirePlan('PRO')
  @CheckQuota({ metric: UsageMetricType.YOUTUBE_VIDEOS, amount: 1 })
  async importYouTube(@Body() dto: ImportDto) {
    return this.youtubeService.import(dto.url);
  }
}
```

### Python (Chat Manager)

```python
from src.common.payment_client import check_quota, require_plan, UsageMetricType

@router.post("/conversations")
@check_quota(UsageMetricType.CONVERSATIONS, amount=1, track_on_success=True)
async def create_conversation(request: Request):
    # Automatic quota check + tracking
    return await service.create()

@router.post("/advanced")
@require_plan('PRO')
@check_quota(UsageMetricType.CONVERSATIONS, amount=1)
async def advanced_feature(request: Request):
    # Plan check + quota check
    return await service.advanced()
```

## How It Works

### 1. Request Flow
```
Client → API Gateway → Upload Manager
                       ↓ (has user from x-user header)
                       QuotaGuard checks quota
                       ↓ (calls payment service API)
                       Payment Service API
                       ↓ (returns allowed=true/false)
                       Handler executes (if allowed)
                       ↓
                       UsageTrackingInterceptor tracks usage
                       ↓ (calls payment service API)
                       Response to client
```

### 2. Automatic Features
- **Quota Checking**: Guards intercept requests, check quotas BEFORE handler
- **Usage Tracking**: Interceptors track usage AFTER successful handler execution
- **Fail Open**: If payment service is down, operations proceed (logged)
- **Error Handling**: Quota exceeded throws `ForbiddenException` with details

### 3. Decorators

**NestJS:**
- `@CheckQuota({ metric, amount })` - Check quota before, track after
- `@RequirePlan('PRO')` - Require plan tier

**Python:**
- `@check_quota(metric, amount, track_on_success=True)` - Check + track
- `@require_plan('PRO')` - Require plan tier

## Next Steps for Each Service

### Upload Manager ✅ Ready
1. Use `@CheckQuota()` on upload routes
2. Check STORAGE (file.size) quotas
3. Check MAX_VIDEO_LENGTH for video uploads
4. Decrement on file delete

### Chat Manager ✅ Ready
1. Initialize client in `main.py`
2. Use `@check_quota()` on conversation routes
3. Check CONVERSATIONS + FILE_CONVERSATIONS quotas

### File Embedder ⏳ TODO
1. Copy `payment_client.py` from chat-manager
2. Initialize in main.py
3. Use `@check_quota()` for EMBEDDINGS metric

## Configuration

### Payment Service
```env
# .env
DATABASE_URL=postgresql://...
LEMON_SQUEEZY_API_KEY=...
PORT=3006
```

### Consumer Services
```env
# .env (upload-manager, chat-manager, etc.)
PAYMENT_SERVICE_URL=http://localhost:3006
SERVICE_NAME=upload-manager  # Unique per service
```

## Testing

### NestJS
```typescript
const mockPaymentClient = {
  checkUsage: jest.fn().mockResolvedValue({ allowed: true, remaining: 1000 }),
  trackUsage: jest.fn().mockResolvedValue(undefined),
};
```

### Python
```python
@patch('src.common.payment_client.get_payment_client')
async def test_endpoint(mock_client):
    mock_client.return_value.check_usage = AsyncMock(
        return_value=UsageCheckResult(allowed=True)
    )
```

## Benefits of This Architecture

1. ✅ **Clean Separation**: Payment service is pure API, clients in consumers
2. ✅ **No Circular Dependencies**: Services call payment service, not itself
3. ✅ **Reusable**: Copy client to any new service
4. ✅ **Type Safe**: TypeScript + Python type hints
5. ✅ **Automatic**: Decorators handle quota checks + tracking
6. ✅ **Fail Open**: Service stays up if payment service is down
7. ✅ **Testable**: Easy to mock in unit tests
8. ✅ **Scalable**: Add new services without modifying payment service

## Files to Reference

- [PAYMENT_ARCHITECTURE.md](./PAYMENT_ARCHITECTURE.md) - Full architecture explanation
- [upload-manager/PAYMENT_INTEGRATION.md](./upload-manager/PAYMENT_INTEGRATION.md) - NestJS guide
- [chat-manager/PAYMENT_INTEGRATION.md](./chat-manager/PAYMENT_INTEGRATION.md) - Python guide
- [payment-service/README.md](./payment-service/README.md) - API documentation

## Quick Start

### For NestJS Services
1. Copy `upload-manager/src/common/payment/` to your service
2. Import `PaymentModule` in app.module.ts
3. Add env vars: `PAYMENT_SERVICE_URL`, `SERVICE_NAME`
4. Use `@CheckQuota()` decorator on routes

### For Python Services
1. Copy `chat-manager/src/common/payment_client.py` to your service
2. Initialize in main.py: `init_payment_client(base_url, service_name)`
3. Add env vars: `PAYMENT_SERVICE_URL`, `SERVICE_NAME`
4. Use `@check_quota()` decorator on routes

That's it! The decorators handle everything automatically.
