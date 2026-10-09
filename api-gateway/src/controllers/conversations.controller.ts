import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { chatV1 } from '@ragspace/shared-ts';
import { CurrentUser } from '../auth/session.guard';
import type { SessionUser } from '../auth/session.service';
import type { ValidatedRequest } from '../http/openapi-validator';
import { toProblem } from '../http/problem';
import { Api, IdempotencyKey, location } from '../http/request';
import { openSse } from '../http/sse';
import { logger } from '../logger';
import * as map from '../mappers';
import { CHAT } from '../rpc/clients';
import type { ChatClient } from '../rpc/clients';

// A reply can chain intent classification, retrieval and a long generation.
const SEND_MESSAGE_DEADLINE_MS = 300_000;

@Controller()
export class ConversationsController {
    constructor(@Inject(CHAT) private readonly chat: ChatClient) {}

    @Get('conversations')
    async list(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const q = api.query as Record<string, any>;
        const response = await this.chat.listConversations({
            userId: user.id,
            fileId: q.fileId,
            collectionId: q.collectionId,
            pageSize: q.limit ?? 0,
            pageToken: q.cursor ?? '',
        });
        return map.page(response.conversations.map(map.conversation), response.nextPageToken);
    }

    @Post('conversations')
    async create(
        @CurrentUser() user: SessionUser,
        @Body() body: { fileId?: string; collectionId?: string },
        @IdempotencyKey() requestId: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const response = await this.chat.createConversation({
            userId: user.id,
            fileId: body.fileId,
            collectionId: body.collectionId,
            requestId,
        });
        location(res, `/conversations/${response.conversation?.id}`);
        res.status(201);
        return map.conversation(response.conversation);
    }

    @Get('conversations/:conversationId')
    async get(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const response = await this.chat.getConversation({ userId: user.id, conversationId: api.params.conversationId });
        return map.conversation(response.conversation);
    }

    @Delete('conversations/:conversationId')
    @HttpCode(204)
    async remove(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        await this.chat.deleteConversation({ userId: user.id, conversationId: api.params.conversationId });
    }

    @Get('conversations/:conversationId/messages')
    async messages(@CurrentUser() user: SessionUser, @Api() api: ValidatedRequest) {
        const q = api.query as Record<string, any>;
        const response = await this.chat.listMessages({
            userId: user.id,
            conversationId: api.params.conversationId,
            pageSize: q.limit ?? 0,
            pageToken: q.cursor ?? '',
        });
        return map.page(response.messages.map(map.message), response.nextPageToken);
    }

    // Errors before the first event become a problem response; after that the stream ends with an error event.
    @Post('conversations/:conversationId/messages')
    async send(
        @CurrentUser() user: SessionUser,
        @Api() api: ValidatedRequest,
        @Body() body: { content: string; fileIds?: string[] },
        @IdempotencyKey() requestId: string,
        @Res() res: Response,
    ): Promise<void> {
        const abort = new AbortController();
        res.on('close', () => abort.abort());
        const stream = this.chat
            .sendMessage(
                {
                    userId: user.id,
                    conversationId: api.params.conversationId,
                    content: body.content,
                    fileIds: body.fileIds ?? [],
                    requestId,
                },
                { signal: abort.signal, deadlineMs: SEND_MESSAGE_DEADLINE_MS },
            )
            [Symbol.asyncIterator]();

        const first = await stream.next();
        const sse = openSse(res);
        try {
            for (let step = first; !step.done; step = await stream.next()) {
                const event = map.chatEvent(step.value);
                if (event) sse.send(event.type as string, event);
            }
        } catch (error) {
            if (!abort.signal.aborted) {
                logger.warn(`Chat stream for ${api.params.conversationId} failed: ${String(error)}`, 'Conversations');
                const failure = toProblem(error);
                sse.send('error', { type: 'error', code: failure.code, message: failure.detail ?? failure.title });
            }
        } finally {
            sse.close();
        }
    }

    @Get('assistant/greeting')
    async greeting(@CurrentUser() user: SessionUser) {
        const response = await this.chat.getGreeting(chatV1.GetGreetingRequest.fromPartial({ userId: user.id, displayName: user.name }));
        return { greeting: response.greeting };
    }
}
