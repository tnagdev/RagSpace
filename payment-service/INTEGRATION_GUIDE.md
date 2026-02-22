# Integrating Payment Service with Other Services

This guide shows how to integrate payment service validation and usage tracking into other microservices in the RagSpace ecosystem.

## Installation in Other Services

### 1. Install Required Dependencies

```bash
npm install @prisma/client axios
```

### 2. Add Environment Variable

```env
PAYMENT_SERVICE_URL=http://localhost:3006
```

## Method 1: HTTP Client Integration (Recommended)

### Create Payment Client Service

Create `src/payment/payment-client.service.ts`:

```typescript
import { Injectable, HttpService, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageMetricType } from '@prisma/client';

@Injectable()
export class PaymentClientService {
  private readonly baseUrl: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get('PAYMENT_SERVICE_URL');
  }

  async checkUsage(
    userId: string,
    metric: UsageMetricType,
    amount: number = 1,
  ): Promise<boolean> {
    try {
      const response = await this.httpService
        .post(
          `${this.baseUrl}/api/usage/check`,
          { metric, amount },
          { headers: { 'x-user-id': userId } },
        )
        .toPromise();

      return response.data.allowed;
    } catch (error) {
      console.error('Failed to check usage:', error);
      return false;
    }
  }

  async trackUsage(
    userId: string,
    metric: UsageMetricType,
    amount: number = 1,
    metadata?: any,
  ): Promise<void> {
    try {
      await this.httpService
        .post(
          `${this.baseUrl}/api/usage/track`,
          { metric, amount, metadata },
          { headers: { 'x-user-id': userId } },
        )
        .toPromise();
    } catch (error) {
      console.error('Failed to track usage:', error);
    }
  }

  async validatePlanAccess(
    userId: string,
    minPlanType: string,
  ): Promise<boolean> {
    try {
      const response = await this.httpService
        .get(`${this.baseUrl}/api/validation/plan-type`, {
          headers: { 'x-user-id': userId },
        })
        .toPromise();

      const planOrder = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
      const userPlanIndex = planOrder.indexOf(response.data.planType);
      const requiredPlanIndex = planOrder.indexOf(minPlanType);

      return userPlanIndex >= requiredPlanIndex;
    } catch (error) {
      console.error('Failed to validate plan access:', error);
      return false;
    }
  }

  async hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
    try {
      const response = await this.httpService
        .post(
          `${this.baseUrl}/api/validation/feature`,
          { feature },
          { headers: { 'x-user-id': userId } },
        )
        .toPromise();

      return response.data.hasAccess;
    } catch (error) {
      console.error('Failed to check feature access:', error);
      return false;
    }
  }

  async getRemainingQuota(
    userId: string,
    metric: UsageMetricType,
  ): Promise<number> {
    try {
      const response = await this.httpService
        .get(`${this.baseUrl}/api/usage/remaining?metric=${metric}`, {
          headers: { 'x-user-id': userId },
        })
        .toPromise();

      return response.data.remaining;
    } catch (error) {
      console.error('Failed to get remaining quota:', error);
      return 0;
    }
  }
}
```

### Create Payment Module

Create `src/payment/payment.module.ts`:

```typescript
import { Module, Global, HttpModule } from '@nestjs/common';
import { PaymentClientService } from './payment-client.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [PaymentClientService],
  exports: [PaymentClientService],
})
export class PaymentModule {}
```

## Usage Examples

### Example 1: Upload Manager Service

```typescript
// upload-manager/src/upload/upload.controller.ts
import { Controller, Post, UseInterceptors, UseGuards } from '@nestjs/common';
import { PaymentClientService } from '../payment/payment-client.service';
import { UsageMetricType } from '@prisma/client';

@Controller('api/upload')
export class UploadController {
  constructor(
    private uploadService: UploadService,
    private paymentClient: PaymentClientService,
  ) {}

  @Post()
  async uploadFile(
    @CurrentUser() user: UserPayload,
    @Body() uploadDto: UploadDto,
  ) {
    // Check if user can upload
    const canUpload = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.DOCUMENTS,
      1,
    );

    if (!canUpload) {
      throw new ForbiddenException(
        'Document upload limit reached. Please upgrade your plan.',
      );
    }

    // Process upload
    const result = await this.uploadService.upload(uploadDto);

    // Track usage
    await this.paymentClient.trackUsage(
      user.id,
      UsageMetricType.DOCUMENTS,
      1,
      { fileId: result.id, fileName: result.name },
    );

    // Also track storage
    await this.paymentClient.trackUsage(
      user.id,
      UsageMetricType.STORAGE,
      result.size,
    );

    return result;
  }

  @Get('quota')
  async getQuota(@CurrentUser() user: UserPayload) {
    const documentsRemaining = await this.paymentClient.getRemainingQuota(
      user.id,
      UsageMetricType.DOCUMENTS,
    );

    const storageRemaining = await this.paymentClient.getRemainingQuota(
      user.id,
      UsageMetricType.STORAGE,
    );

    return {
      documents: { remaining: documentsRemaining },
      storage: { remaining: storageRemaining },
    };
  }
}
```

### Example 2: Chat Manager Service

```typescript
// chat-manager/src/chat/chat.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { PaymentClientService } from '../payment/payment-client.service';
import { UsageMetricType } from '@prisma/client';

@Controller('api/chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private paymentClient: PaymentClientService,
  ) {}

  @Post('conversations')
  async createConversation(@CurrentUser() user: UserPayload) {
    // Check conversation limit
    const canCreate = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.CONVERSATIONS,
      1,
    );

    if (!canCreate) {
      throw new ForbiddenException(
        'Conversation limit reached. Upgrade to create more conversations.',
      );
    }

    const conversation = await this.chatService.createConversation(user.id);

    // Track usage
    await this.paymentClient.trackUsage(
      user.id,
      UsageMetricType.CONVERSATIONS,
      1,
      { conversationId: conversation.id },
    );

    return conversation;
  }

  @Post(':conversationId/messages')
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: UserPayload,
    @Body() messageDto: MessageDto,
  ) {
    // Check file chat limit
    const canChat = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.FILE_CHATS,
      1,
    );

    if (!canChat) {
      throw new ForbiddenException(
        'File chat limit reached. Upgrade your plan.',
      );
    }

    const message = await this.chatService.sendMessage(
      conversationId,
      messageDto,
    );

    // Track usage
    await this.paymentClient.trackUsage(
      user.id,
      UsageMetricType.FILE_CHATS,
      1,
    );

    return message;
  }
}
```

### Example 3: Scene Detector (Python Service)

```python
# scene-detector/src/services/payment_client.py
import os
import httpx
from typing import Optional

class PaymentClient:
    def __init__(self):
        self.base_url = os.getenv("PAYMENT_SERVICE_URL", "http://localhost:3006")
        self.client = httpx.AsyncClient()
    
    async def check_usage(
        self, 
        user_id: str, 
        metric: str, 
        amount: int = 1
    ) -> bool:
        try:
            response = await self.client.post(
                f"{self.base_url}/api/usage/check",
                json={"metric": metric, "amount": amount},
                headers={"x-user-id": user_id}
            )
            return response.json().get("allowed", False)
        except Exception as e:
            print(f"Failed to check usage: {e}")
            return False
    
    async def track_usage(
        self,
        user_id: str,
        metric: str,
        amount: int = 1,
        metadata: Optional[dict] = None
    ) -> None:
        try:
            await self.client.post(
                f"{self.base_url}/api/usage/track",
                json={
                    "metric": metric,
                    "amount": amount,
                    "metadata": metadata or {}
                },
                headers={"x-user-id": user_id}
            )
        except Exception as e:
            print(f"Failed to track usage: {e}")

# Usage in scene detector
async def process_video(user_id: str, video_path: str):
    payment_client = PaymentClient()
    
    # Check if user can process scenes
    can_process = await payment_client.check_usage(
        user_id, 
        "SCENES", 
        1
    )
    
    if not can_process:
        raise Exception("Scene processing limit reached")
    
    # Process video
    scenes = detect_scenes(video_path)
    
    # Track usage
    await payment_client.track_usage(
        user_id,
        "SCENES",
        len(scenes),
        metadata={"video_path": video_path}
    )
    
    return scenes
```

## Method 2: Custom Decorators (Advanced)

### Create Custom Guard

```typescript
// src/guards/usage.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentClientService } from '../payment/payment-client.service';

export const CHECK_USAGE_KEY = 'checkUsage';

@Injectable()
export class UsageGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private paymentClient: PaymentClientService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const usageCheck = this.reflector.get(
      CHECK_USAGE_KEY,
      context.getHandler(),
    );

    if (!usageCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-user-id'];

    if (!userId) {
      throw new ForbiddenException('User authentication required');
    }

    const canProceed = await this.paymentClient.checkUsage(
      userId,
      usageCheck.metric,
      usageCheck.amount || 1,
    );

    if (!canProceed) {
      throw new ForbiddenException(
        `Usage limit exceeded for ${usageCheck.metric}`,
      );
    }

    // Store for tracking after success
    request.usageTracking = usageCheck;

    return true;
  }
}
```

### Create Custom Decorator

```typescript
// src/decorators/check-usage.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const CHECK_USAGE_KEY = 'checkUsage';

export interface UsageCheck {
  metric: string;
  amount?: number;
}

export const CheckUsage = (check: UsageCheck) =>
  SetMetadata(CHECK_USAGE_KEY, check);
```

### Use in Controller

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { UsageGuard } from '../guards/usage.guard';
import { CheckUsage } from '../decorators/check-usage.decorator';

@Controller('api/files')
@UseGuards(UsageGuard)
export class FilesController {
  @CheckUsage({ metric: 'DOCUMENTS', amount: 1 })
  @Post()
  async uploadDocument() {
    // Automatically validated before reaching here
  }
}
```

## Best Practices

1. **Always check before operation**: Validate limits before processing
2. **Track after success**: Only track usage after successful operations
3. **Handle errors gracefully**: Don't block users if payment service is down
4. **Cache quota info**: Cache remaining quota for better performance
5. **Batch operations**: Check/track in batches when processing multiple items
6. **Provide clear feedback**: Tell users why they hit limits and how to upgrade

## Testing

### Mock Payment Client for Tests

```typescript
// test/mocks/payment-client.mock.ts
export const MockPaymentClientService = {
  checkUsage: jest.fn().mockResolvedValue(true),
  trackUsage: jest.fn().mockResolvedValue(undefined),
  validatePlanAccess: jest.fn().mockResolvedValue(true),
  hasFeatureAccess: jest.fn().mockResolvedValue(true),
  getRemainingQuota: jest.fn().mockResolvedValue(100),
};
```

## Troubleshooting

### Payment Service Unavailable

Implement circuit breaker pattern:

```typescript
async checkUsage(userId: string, metric: string): Promise<boolean> {
  try {
    // Try payment service
    return await this.paymentClient.checkUsage(userId, metric);
  } catch (error) {
    // Fallback: allow but log warning
    console.warn('Payment service unavailable, allowing operation');
    return true;
  }
}
```

### Rate Limiting

Consider caching quota information:

```typescript
@Injectable()
export class CachedPaymentService {
  private cache = new Map<string, { quota: number; expires: number }>();

  async getRemainingQuota(userId: string, metric: string): Promise<number> {
    const cacheKey = `${userId}:${metric}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.quota;
    }

    const quota = await this.paymentClient.getRemainingQuota(userId, metric);
    
    this.cache.set(cacheKey, {
      quota,
      expires: Date.now() + 60000, // 1 minute cache
    });

    return quota;
  }
}
```
