# Payment Integration - Upload Manager

## Overview

The upload-manager now has built-in payment/quota validation through decorators and guards that automatically check quotas before operations and track usage after success.

## Usage Examples

### 1. Simple Document Upload with Quota Check

```typescript
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CheckQuota, UsageMetricType } from '../common/payment';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('upload')
export class UploadController {
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @CheckQuota({
    metric: UsageMetricType.STORAGE,
    getAmount: (req) => req.file.size, // Dynamic amount based on file size
  })
  async uploadFile(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // 1. QuotaGuard checks DOCUMENTS quota (1 document)
    // 2. QuotaGuard checks STORAGE quota (file.size bytes)
    // 3. If both pass, this handler executes
    // 4. UsageTrackingInterceptor automatically tracks usage after success
    
    return this.uploadService.upload(file);
  }
}
```

### 2. Premium Feature with Plan Check

```typescript
import { Controller, Post } from '@nestjs/common';
import { RequirePlan, CheckQuota, UsageMetricType } from '../common/payment';

@Controller('youtube')
export class YouTubeController {
  @Post('import')
  @RequirePlan('PRO') // Requires PRO plan or higher
  @CheckQuota({
    metric: UsageMetricType.YOUTUBE_VIDEOS,
    amount: 1,
  })
  async importYouTube(@Body() dto: ImportYouTubeDto) {
    // 1. PlanGuard checks if user has PRO plan
    // 2. QuotaGuard checks YOUTUBE_VIDEOS quota
    // 3. Handler executes
    // 4. Usage tracked automatically
    
    return this.youtubeService.import(dto.url);
  }
}
```

### 3. Manual Usage Tracking (for complex scenarios)

```typescript
import { Controller, Post, Delete } from '@nestjs/common';
import { PaymentClientService, UsageMetricType } from '../common/payment';

@Controller('files')
export class FilesController {
  constructor(private paymentClient: PaymentClientService) {}

  @Post('batch')
  async batchUpload(@CurrentUser() user: any, @Body() files: File[]) {
    // Manual check for batch operations
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    
    const check = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.STORAGE,
      totalSize,
    );

    if (!check.allowed) {
      throw new ForbiddenException('Storage quota exceeded');
    }

    // Process files
    const results = await this.uploadService.batchUpload(files);

    // Manually track usage
    await this.paymentClient.trackUsage(
      user.id,
      UsageMetricType.STORAGE,
      totalSize,
      { fileCount: files.length }
    );

    return results;
  }

  @Delete(':id')
  async deleteFile(@CurrentUser() user: any, @Param('id') id: string) {
    const file = await this.uploadService.getFile(id);
    
    await this.uploadService.delete(id);

    // Decrement quota when deleting
    await this.paymentClient.decrementUsage(
      user.id,
      UsageMetricType.STORAGE,
      file.size,
    );

    await this.paymentClient.decrementUsage(
      user.id,
      UsageMetricType.DOCUMENTS,
      1,
    );

    return { success: true };
  }
}
```

## How It Works

### 1. Decorator-Based Quota Checking
```typescript
@CheckQuota({ metric: UsageMetricType.DOCUMENTS, amount: 1 })
```
- **QuotaGuard** intercepts the request
- Checks user's quota with payment service
- If quota exceeded, throws `ForbiddenException` with details
- If allowed, request proceeds to handler

### 2. Automatic Usage Tracking
```typescript
// No code needed!
```
- **UsageTrackingInterceptor** automatically tracks usage after successful route execution
- Only tracks if `@CheckQuota()` was used
- Tracks on success, skips on error
- Non-blocking (logs errors but doesn't throw)

### 3. Plan-Based Access Control
```typescript
@RequirePlan('PRO')
```
- **PlanGuard** validates user's plan tier
- Checks if user has at least the required plan
- Throws `ForbiddenException` if plan insufficient

## Configuration

Add to `.env`:
```env
PAYMENT_SERVICE_URL=http://localhost:3006
SERVICE_NAME=upload-manager
```

## Available Metrics

```typescript
enum UsageMetricType {
  CONVERSATIONS = 'CONVERSATIONS',
  STORAGE = 'STORAGE',
  FILE_CONVERSATIONS = 'FILE_CONVERSATIONS',
  YOUTUBE_VIDEOS = 'YOUTUBE_VIDEOS',
  EMBEDDINGS = 'EMBEDDINGS',
  MAX_VIDEO_LENGTH = 'MAX_VIDEO_LENGTH',
}
```

## Dynamic Amount Calculation

Use `getAmount` function for dynamic amounts:

```typescript
@CheckQuota({
  metric: UsageMetricType.STORAGE,
  getAmount: (req) => {
    // Access request to calculate amount
    return req.file.size;
  }
})
```

## Error Handling

### Quota Exceeded
```json
{
  "statusCode": 403,
  "message": "Quota exceeded for STORAGE",
  "metric": "STORAGE",
  "limit": 10737418240,
  "remaining": 0,
  "required": 5242880
}
```

### Plan Insufficient
```json
{
  "statusCode": 403,
  "message": "PRO plan or higher required",
  "currentPlan": "BASIC",
  "requiredPlan": "PRO"
}
```

## Fail-Open Strategy

If payment service is unavailable:
- Quota checks **allow** operations (fail open)
- Usage tracking fails silently (logs error)
- Service remains operational

Monitor logs for payment service connectivity issues.

## Best Practices

1. **Use decorators for simple cases** - Cleaner code, automatic tracking
2. **Manual tracking for complex scenarios** - Batch operations, conditional tracking
3. **Always decrement on delete** - Free up quota when resources removed
4. **Stack decorators** - `@RequirePlan()` + `@CheckQuota()` for premium features
5. **Dynamic amounts** - Use `getAmount` for variable-sized operations

## Testing

Mock the PaymentClientService in tests:

```typescript
const mockPaymentClient = {
  checkUsage: jest.fn().mockResolvedValue({ allowed: true, remaining: 1000 }),
  trackUsage: jest.fn().mockResolvedValue(undefined),
  decrementUsage: jest.fn().mockResolvedValue(undefined),
};

const module = await Test.createTestingModule({
  providers: [
    YourService,
    { provide: PaymentClientService, useValue: mockPaymentClient },
  ],
}).compile();
```

## What Gets Installed

- ✅ `PaymentClientService` - HTTP client to payment service
- ✅ `QuotaGuard` - Validates quotas before routes
- ✅ `PlanGuard` - Validates plan tier requirements
- ✅ `UsageTrackingInterceptor` - Auto-tracks after success
- ✅ `@CheckQuota()` - Decorator for quota validation
- ✅ `@RequirePlan()` - Decorator for plan validation

All registered globally - just use decorators, no need to manually add guards!
