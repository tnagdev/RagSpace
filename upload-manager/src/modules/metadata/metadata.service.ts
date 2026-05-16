import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFileMetadataDto, UpdateFileMetadataDto } from './dto';
import { MetadataSourceType, Prisma } from '@prisma/client';

@Injectable()
export class MetadataService {
    private readonly logger = new Logger(MetadataService.name);

    constructor(private prisma: PrismaService) { }

    async createMetadata(dto: CreateFileMetadataDto) {
        this.logger.log(`Creating metadata for file: ${dto.fileId}, scene: ${dto.sceneId || 'N/A'}`);

        const metadata = await this.prisma.fileMetadata.create({
            data: {
                fileId: dto.fileId,
                sceneId: dto.sceneId,
                sourceType: dto.sourceType,
                summary: dto.summary,
                objects: dto.objects || [],
                setting: dto.setting,
                style: dto.style,
                colors: dto.colors || [],
                rawResponse: dto.rawResponse,
            },
        });

        this.logger.log(`Metadata created: ${metadata.id}`);
        return metadata;
    }

    async upsertMetadata(dto: CreateFileMetadataDto) {
        this.logger.log(`Upserting metadata for file: ${dto.fileId}, scene: ${dto.sceneId || 'N/A'}`);

        const sceneIdValue = dto.sceneId || null;
        const existing = await this.prisma.fileMetadata.findFirst({
            where: {
                fileId: dto.fileId,
                sceneId: sceneIdValue,
            },
        });

        let metadata;
        if (existing) {
            metadata = await this.prisma.fileMetadata.update({
                where: { id: existing.id },
                data: {
                    summary: dto.summary,
                    objects: dto.objects || [],
                    setting: dto.setting,
                    style: dto.style,
                    colors: dto.colors || [],
                    rawResponse: dto.rawResponse,
                },
            });
        } else {
            metadata = await this.prisma.fileMetadata.create({
                data: {
                    fileId: dto.fileId,
                    sceneId: sceneIdValue,
                    sourceType: dto.sourceType,
                    summary: dto.summary,
                    objects: dto.objects || [],
                    setting: dto.setting,
                    style: dto.style,
                    colors: dto.colors || [],
                    rawResponse: dto.rawResponse,
                },
            });
        }

        this.logger.log(`Metadata upserted: ${metadata.id}`);
        return metadata;
    }

    async upsertMetadataBatch(dtos: CreateFileMetadataDto[]) {
        if (dtos.length === 0) return [];
        this.logger.log(`Batch upserting ${dtos.length} metadata records`);

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.fileMetadata.findMany({
                where: {
                    OR: dtos.map((d) => ({ fileId: d.fileId, sceneId: d.sceneId ?? null })),
                },
                select: { id: true, fileId: true, sceneId: true },
            });

            const existingMap = new Map(
                existing.map((r) => [`${r.fileId}:${r.sceneId}`, r.id]),
            );

            const toCreate: CreateFileMetadataDto[] = [];
            const toUpdate: { id: string; dto: CreateFileMetadataDto }[] = [];

            for (const dto of dtos) {
                const key = `${dto.fileId}:${dto.sceneId ?? null}`;
                const existingId = existingMap.get(key);
                if (existingId) {
                    toUpdate.push({ id: existingId, dto });
                } else {
                    toCreate.push(dto);
                }
            }

            const created = toCreate.length > 0
                ? await tx.fileMetadata.createManyAndReturn({
                    data: toCreate.map((dto) => ({
                        fileId: dto.fileId,
                        sceneId: dto.sceneId ?? null,
                        sourceType: dto.sourceType,
                        summary: dto.summary,
                        objects: dto.objects ?? [],
                        setting: dto.setting,
                        style: dto.style,
                        colors: dto.colors ?? [],
                        rawResponse: dto.rawResponse,
                    })),
                })
                : [];

            let updated: Prisma.FileMetadataGetPayload<object>[] = [];
            if (toUpdate.length > 0) {
                const values = toUpdate
                    .map((_, i) => {
                        const base = i * 7;
                        return `($${base + 1}::uuid, $${base + 2}, $${base + 3}::text[], $${base + 4}, $${base + 5}, $${base + 6}::text[], $${base + 7}::jsonb)`;
                    })
                    .join(', ');

                const params: unknown[] = [];
                for (const { id, dto } of toUpdate) {
                    params.push(
                        id,
                        dto.summary ?? null,
                        dto.objects ?? [],
                        dto.setting ?? null,
                        dto.style ?? null,
                        dto.colors ?? [],
                        dto.rawResponse ? JSON.stringify(dto.rawResponse) : null,
                    );
                }

                updated = await tx.$queryRaw<Prisma.FileMetadataGetPayload<object>[]>(
                    Prisma.raw(`
                        UPDATE upload.file_metadata AS m
                        SET
                            summary    = v.summary,
                            objects    = v.objects,
                            setting    = v.setting,
                            style      = v.style,
                            colors     = v.colors,
                            "rawResponse" = v.raw_response,
                            "updatedAt" = NOW()
                        FROM (VALUES ${values}) AS v(id, summary, objects, setting, style, colors, raw_response)
                        WHERE m.id = v.id::uuid
                        RETURNING m.*
                    `),
                    ...params,
                );
            }

            this.logger.log(`Batch upserted: ${created.length} created, ${updated.length} updated`);
            return [...created, ...updated];
        });
    }

    async getMetadataById(id: string) {
        const metadata = await this.prisma.fileMetadata.findUnique({
            where: { id },
        });

        if (!metadata) {
            throw new NotFoundException(`Metadata with id ${id} not found`);
        }

        return metadata;
    }

    async getMetadataByFileId(fileId: string) {
        return this.prisma.fileMetadata.findMany({
            where: { fileId },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getMetadataByFileIds(fileIds: string[]) {
        if (!fileIds || fileIds.length === 0) {
            return [];
        }
        return this.prisma.fileMetadata.findMany({
            where: { fileId: { in: fileIds } },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getMetadataBySceneId(sceneId: string) {
        return this.prisma.fileMetadata.findFirst({
            where: { sceneId },
        });
    }

    async getMetadataBySceneIds(sceneIds: string[]) {
        if (!sceneIds || sceneIds.length === 0) {
            return [];
        }
        return this.prisma.fileMetadata.findMany({
            where: { sceneId: { in: sceneIds } },
        });
    }

    async getMetadataByFileAndScene(fileId: string, sceneId?: string) {
        return this.prisma.fileMetadata.findUnique({
            where: {
                fileId_sceneId: {
                    fileId,
                    sceneId: (sceneId || null) as string,
                },
            },
        });
    }

    async updateMetadata(id: string, dto: UpdateFileMetadataDto) {
        const existing = await this.prisma.fileMetadata.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new NotFoundException(`Metadata with id ${id} not found`);
        }

        return this.prisma.fileMetadata.update({
            where: { id },
            data: {
                summary: dto.summary,
                objects: dto.objects,
                setting: dto.setting,
                style: dto.style,
                colors: dto.colors,
                rawResponse: dto.rawResponse,
            },
        });
    }

    async deleteMetadata(id: string) {
        const existing = await this.prisma.fileMetadata.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new NotFoundException(`Metadata with id ${id} not found`);
        }

        await this.prisma.fileMetadata.delete({
            where: { id },
        });

        return { success: true, message: 'Metadata deleted successfully' };
    }

    async deleteMetadataByFileId(fileId: string) {
        const result = await this.prisma.fileMetadata.deleteMany({
            where: { fileId },
        });

        return { success: true, count: result.count };
    }
}
