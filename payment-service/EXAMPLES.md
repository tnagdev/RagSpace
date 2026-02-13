/**
 * Example: Using Payment Service Decorators in Upload Manager
 * 
 * This file demonstrates how to integrate payment service validation
 * and usage tracking in another microservice.
 */

import { 
  Controller, 
  Post, 
  Get,
  Body, 
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

// Types from payment service (copy these)
enum UsageMetricType {
  CONVERSATIONS = 'CONVERSATIONS',
  STORAGE = 'STORAGE',
  FILE_CHATS = 'FILE_CHATS',
  YOUTUBE_VIDEOS = 'YOUTUBE_VIDEOS',
  API_CALLS = 'API_CALLS',
  DOCUMENTS = 'DOCUMENTS',
  SCENES = 'SCENES',
  EMBEDDINGS = 'EMBEDDINGS',
}

// User decorator (copy from payment service)
interface UserPayload {
  id: string;
  email: string;
  name: string;
}

// Create Payment Client Service
class PaymentClientService {
  private readonly baseUrl: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get('PAYMENT_SERVICE_URL', 'http://localhost:3006');
  }

  async checkUsage(
    userId: string,
    metric: UsageMetricType,
    amount: number = 1,
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/usage/check`,
          { metric, amount },
          { headers: { 'x-user-id': userId } },
        ),
      );
      return response.data.allowed;
    } catch (error) {
      console.error('Failed to check usage:', error);
      // Fail open in case payment service is down
      return true;
    }
  }

  async trackUsage(
    userId: string,
    metric: UsageMetricType,
    amount: number = 1,
    metadata?: any,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/usage/track`,
          { metric, amount, metadata },
          { headers: { 'x-user-id': userId } },
        ),
      );
    } catch (error) {
      console.error('Failed to track usage:', error);
      // Don't throw - tracking failure shouldn't break the flow
    }
  }

  async decrementUsage(
    userId: string,
    metric: UsageMetricType,
    amount: number = 1,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/usage/decrement`,
          { metric, amount },
          { headers: { 'x-user-id': userId } },
        ),
      );
    } catch (error) {
      console.error('Failed to decrement usage:', error);
    }
  }

  async validatePlanAccess(
    userId: string,
    minPlanType: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE',
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/validation/plan-type`, {
          headers: { 'x-user-id': userId },
        }),
      );

      const planOrder = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
      const userPlanIndex = planOrder.indexOf(response.data.planType);
      const requiredPlanIndex = planOrder.indexOf(minPlanType);

      return userPlanIndex >= requiredPlanIndex;
    } catch (error) {
      console.error('Failed to validate plan access:', error);
      return true; // Fail open
    }
  }

  async getRemainingQuota(
    userId: string,
    metric: UsageMetricType,
  ): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/usage/remaining?metric=${metric}`,
          { headers: { 'x-user-id': userId } },
        ),
      );
      return response.data.remaining;
    } catch (error) {
      console.error('Failed to get remaining quota:', error);
      return Infinity;
    }
  }
}

// Example Controller with Payment Integration
@Controller('api/upload')
export class UploadController {
  constructor(
    private uploadService: UploadService,
    private paymentClient: PaymentClientService,
  ) {}

  // Example 1: Check usage before upload
  @Post()
  async uploadFile(
    @Body() uploadDto: UploadFileDto,
    @CurrentUser() user: UserPayload,
  ) {
    // Check if user can upload more documents
    const canUpload = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.DOCUMENTS,
      1,
    );

    if (!canUpload) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Document upload limit reached',
          error: 'QUOTA_EXCEEDED',
          upgradeUrl: '/plans',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      // Process upload
      const result = await this.uploadService.upload(uploadDto);

      // Track successful upload
      await this.paymentClient.trackUsage(
        user.id,
        UsageMetricType.DOCUMENTS,
        1,
        {
          fileId: result.id,
          fileName: result.name,
          fileSize: result.size,
        },
      );

      // Also track storage usage
      await this.paymentClient.trackUsage(
        user.id,
        UsageMetricType.STORAGE,
        result.size,
        { fileId: result.id },
      );

      return result;
    } catch (error) {
      // If upload fails, we didn't actually use quota
      // (but checkUsage doesn't reserve, so no need to rollback)
      throw error;
    }
  }

  // Example 2: Get quota information
  @Get('quota')
  async getQuota(@CurrentUser() user: UserPayload) {
    const [documents, storage] = await Promise.all([
      this.paymentClient.getRemainingQuota(user.id, UsageMetricType.DOCUMENTS),
      this.paymentClient.getRemainingQuota(user.id, UsageMetricType.STORAGE),
    ]);

    return {
      documents: {
        remaining: documents,
        unlimited: documents === Infinity,
      },
      storage: {
        remaining: storage,
        unlimited: storage === Infinity,
        formattedRemaining: this.formatBytes(storage),
      },
    };
  }

  // Example 3: Delete file and decrement usage
  @Delete(':fileId')
  async deleteFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: UserPayload,
  ) {
    const file = await this.uploadService.findById(fileId);

    if (!file || file.userId !== user.id) {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }

    // Delete the file
    await this.uploadService.delete(fileId);

    // Decrement usage counters
    await Promise.all([
      this.paymentClient.decrementUsage(
        user.id,
        UsageMetricType.DOCUMENTS,
        1,
      ),
      this.paymentClient.decrementUsage(
        user.id,
        UsageMetricType.STORAGE,
        file.size,
      ),
    ]);

    return { success: true };
  }

  // Example 4: Validate plan for premium feature
  @Post('youtube')
  async uploadYouTubeVideo(
    @Body() dto: YouTubeUploadDto,
    @CurrentUser() user: UserPayload,
  ) {
    // Check if user has access to YouTube feature
    const hasAccess = await this.paymentClient.validatePlanAccess(
      user.id,
      'BASIC', // Minimum BASIC plan required
    );

    if (!hasAccess) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'YouTube integration requires Basic plan or higher',
          error: 'PLAN_UPGRADE_REQUIRED',
          upgradeUrl: '/plans',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Check YouTube video quota
    const canUpload = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.YOUTUBE_VIDEOS,
      1,
    );

    if (!canUpload) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'YouTube video limit reached',
          error: 'QUOTA_EXCEEDED',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Process YouTube upload
    const result = await this.uploadService.uploadFromYouTube(dto);

    // Track usage
    await this.paymentClient.trackUsage(
      user.id,
      UsageMetricType.YOUTUBE_VIDEOS,
      1,
      {
        videoId: result.id,
        youtubeUrl: dto.url,
      },
    );

    return result;
  }

  // Helper method
  private formatBytes(bytes: number): string {
    if (bytes === Infinity) return 'Unlimited';
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Example: Chat Service Integration
@Controller('api/chat')
export class ChatController {
  constructor(
    private chatService: ChatService,
    private paymentClient: PaymentClientService,
  ) {}

  @Post('conversations')
  async createConversation(@CurrentUser() user: UserPayload) {
    // Check conversation quota
    const canCreate = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.CONVERSATIONS,
      1,
    );

    if (!canCreate) {
      const remaining = await this.paymentClient.getRemainingQuota(
        user.id,
        UsageMetricType.CONVERSATIONS,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: `Conversation limit reached. You have ${remaining} conversations remaining.`,
          error: 'QUOTA_EXCEEDED',
          remaining,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const conversation = await this.chatService.create(user.id);

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
    @Body() dto: SendMessageDto,
    @CurrentUser() user: UserPayload,
  ) {
    // Check file chat quota
    const canChat = await this.paymentClient.checkUsage(
      user.id,
      UsageMetricType.FILE_CHATS,
      1,
    );

    if (!canChat) {
      throw new HttpException(
        'File chat limit reached. Upgrade your plan.',
        HttpStatus.FORBIDDEN,
      );
    }

    const message = await this.chatService.sendMessage(conversationId, dto);

    await this.paymentClient.trackUsage(
      user.id,
      UsageMetricType.FILE_CHATS,
      1,
      {
        conversationId,
        messageId: message.id,
      },
    );

    return message;
  }
}

// Example: Scene Detector Integration (Python)
/**
 * Python Implementation:
 * 
 * import httpx
 * from typing import Optional
 * 
 * class PaymentClient:
 *     def __init__(self, base_url: str = "http://localhost:3006"):
 *         self.base_url = base_url
 *         self.client = httpx.AsyncClient()
 *     
 *     async def check_usage(self, user_id: str, metric: str, amount: int = 1) -> bool:
 *         try:
 *             response = await self.client.post(
 *                 f"{self.base_url}/api/usage/check",
 *                 json={"metric": metric, "amount": amount},
 *                 headers={"x-user-id": user_id}
 *             )
 *             return response.json().get("allowed", False)
 *         except Exception as e:
 *             print(f"Failed to check usage: {e}")
 *             return True  # Fail open
 *     
 *     async def track_usage(
 *         self, 
 *         user_id: str, 
 *         metric: str, 
 *         amount: int = 1, 
 *         metadata: Optional[dict] = None
 *     ) -> None:
 *         try:
 *             await self.client.post(
 *                 f"{self.base_url}/api/usage/track",
 *                 json={"metric": metric, "amount": amount, "metadata": metadata or {}},
 *                 headers={"x-user-id": user_id}
 *             )
 *         except Exception as e:
 *             print(f"Failed to track usage: {e}")
 * 
 * # Usage
 * async def process_scenes(user_id: str, video_path: str):
 *     payment = PaymentClient()
 *     
 *     if not await payment.check_usage(user_id, "SCENES", 1):
 *         raise Exception("Scene processing limit reached")
 *     
 *     scenes = detect_scenes(video_path)
 *     
 *     await payment.track_usage(
 *         user_id, 
 *         "SCENES", 
 *         len(scenes),
 *         metadata={"video_path": video_path}
 *     )
 *     
 *     return scenes
 */
