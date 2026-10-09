import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { commonV1, filesV1 } from '@ragspace/shared-ts';
import { CurrentUser } from '../auth/session.guard';
import type { SessionUser } from '../auth/session.service';
import { FileUpdatesService } from '../events/file-updates.service';
import { openSse } from '../http/sse';
import * as map from '../mappers';
import { FILES } from '../rpc/clients';
import type { FilesClient } from '../rpc/clients';

const SNAPSHOT_PAGES = 5;
const ACTIVE_FILTERS: Partial<filesV1.ListFilesRequest>[] = [
    { uploadStatus: commonV1.UploadStatus.UPLOAD_STATUS_PENDING },
    { uploadStatus: commonV1.UploadStatus.UPLOAD_STATUS_UPLOADING },
    { processingStatus: commonV1.ProcessingStatus.PROCESSING_STATUS_NOT_STARTED, uploadStatus: commonV1.UploadStatus.UPLOAD_STATUS_COMPLETED },
    { processingStatus: commonV1.ProcessingStatus.PROCESSING_STATUS_IN_PROGRESS },
];

@Controller('events')
export class EventsController {
    constructor(
        @Inject(FILES) private readonly files: FilesClient,
        private readonly updates: FileUpdatesService,
    ) {}

    // Subscribing before the snapshot means no update is lost between the two.
    @Get()
    async stream(@CurrentUser() user: SessionUser, @Res() res: Response): Promise<void> {
        const pending: Record<string, unknown>[] = [];
        let live = false;
        let sse: ReturnType<typeof openSse> | undefined;
        const unsubscribe = this.updates.listen(user.id, (update) => {
            const state = map.fileUpdate(update);
            if (live && sse) sse.send('file.updated', { type: 'file.updated', file: state });
            else pending.push(state);
        });
        res.on('close', () => {
            unsubscribe();
            sse?.close();
        });

        try {
            const snapshot = await this.activeFiles(user.id);
            sse = openSse(res);
            sse.send('files.snapshot', { type: 'files.snapshot', files: snapshot });
            for (const state of pending) sse.send('file.updated', { type: 'file.updated', file: state });
            live = true;
        } catch (error) {
            unsubscribe();
            throw error;
        }
    }

    private async activeFiles(userId: string): Promise<Record<string, unknown>[]> {
        const byId = new Map<string, filesV1.File>();
        for (const filter of ACTIVE_FILTERS) {
            let pageToken = '';
            for (let pageNumber = 0; pageNumber < SNAPSHOT_PAGES; pageNumber++) {
                const response = await this.files.listFiles(
                    filesV1.ListFilesRequest.fromPartial({ userId, pageSize: 100, pageToken, ...filter }),
                );
                for (const file of response.files) byId.set(file.id, file);
                pageToken = response.nextPageToken;
                if (!pageToken) break;
            }
        }
        return [...byId.values()].map(map.fileState);
    }
}
