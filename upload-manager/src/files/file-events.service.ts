import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eventsV1 } from '@ragspace/shared-ts';
import { eventBus } from '../events/event-bus';
import { FilesService } from './files.service';

@Injectable()
export class FileEventsService implements OnModuleInit {
    private readonly logger = new Logger(FileEventsService.name);

    constructor(private readonly files: FilesService) { }

    onModuleInit(): void {
        eventBus.subscribe(
            { queue: 'files.events', routingKeys: ['file.stage_changed', 'user.deleted'] },
            (envelope) => this.handle(envelope),
        );
    }

    private async handle(envelope: eventsV1.Envelope): Promise<void> {
        switch (envelope.payload?.$case) {
            case 'fileStageChanged':
                await this.files.applyStageChange(envelope.payload.fileStageChanged);
                return;
            case 'userDeleted': {
                const removed = await this.files.purgeUser(envelope.payload.userDeleted.userId);
                this.logger.log(`Purged ${removed} file(s) for deleted user ${envelope.payload.userDeleted.userId}`);
                return;
            }
            default:
                this.logger.warn(`Ignoring ${envelope.type}`);
        }
    }
}
