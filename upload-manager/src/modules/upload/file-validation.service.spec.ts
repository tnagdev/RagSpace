import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FileValidationService } from './file-validation.service';
import { PaymentClientService, UsageMetricType } from '../../common/payment/payment-client.service';
import { FileType } from '@prisma/client';

// `import * as ffprobe from 'ffprobe'` compiles through __importStar, which returns a
// plain namespace object (not callable) unless the module has { __esModule: true }.
// A Proxy with that flag causes __importStar to pass the callable function through unchanged.
jest.mock('ffprobe', () => {
    const fn = jest.fn();
    return new Proxy(fn, {
        get(target, prop) {
            if (prop === '__esModule') return true;
            return Reflect.get(target, prop);
        },
    });
});
jest.mock('ffprobe-static', () => ({ path: '/mock/ffprobe/bin' }));
// `import sharp from 'sharp'` compiles through __importDefault; the factory result IS
// the called function, so a plain jest.fn() works here.
jest.mock('sharp', () => jest.fn());

const ffprobeMock = require('ffprobe') as jest.Mock;
const sharpMock = require('sharp') as jest.Mock;

describe('FileValidationService', () => {
    let service: FileValidationService;
    let paymentClient: jest.Mocked<PaymentClientService>;

    const pathFile = (mimetype: string, name = 'test', ext = 'mp4') => ({
        path: `/tmp/${name}.${ext}`,
        mimetype,
        size: 1024,
        originalname: `${name}.${ext}`,
    });

    const bufferFile = (mimetype: string, name = 'test', ext = 'jpg') => ({
        buffer: Buffer.from('fake-image-data'),
        mimetype,
        size: 2048,
        originalname: `${name}.${ext}`,
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FileValidationService,
                {
                    provide: PaymentClientService,
                    useValue: {
                        checkUsage: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<FileValidationService>(FileValidationService);
        paymentClient = module.get(PaymentClientService) as any;

        // Default happy-path implementation: all checks allowed, unlimited limit
        paymentClient.checkUsage.mockResolvedValue({ allowed: true, limit: 'unlimited' });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    // ---------------------------------------------------------------------------
    // validateFile — top-level gating
    // ---------------------------------------------------------------------------

    describe('validateFile', () => {
        it('throws BadRequestException for document MIME types without touching storage quota', async () => {
            const file = { mimetype: 'application/pdf', size: 1024, originalname: 'doc.pdf' };
            await expect(service.validateFile(file as any, 'user-1')).rejects.toThrow(BadRequestException);
            expect(paymentClient.checkUsage).not.toHaveBeenCalled();
        });

        it('throws ForbiddenException when storage quota is exceeded', async () => {
            paymentClient.checkUsage.mockResolvedValueOnce({
                allowed: false,
                limit: 1 * 1024 * 1024 * 1024,
            });
            const file = { mimetype: 'video/mp4', size: 2 * 1024 * 1024 * 1024, originalname: 'big.mp4' };
            await expect(service.validateFile(file as any, 'user-1')).rejects.toThrow(ForbiddenException);
        });

        it('routes video/* MIME to the video validator and returns VIDEO fileType', async () => {
            ffprobeMock.mockResolvedValue({ streams: [{ duration: 120 }] });
            paymentClient.checkUsage.mockResolvedValue({ allowed: true });

            const result = await service.validateFile(pathFile('video/mp4') as any, 'user-1');

            expect(result.fileType).toBe(FileType.VIDEO);
        });

        it('routes image/* MIME to the image validator and returns IMAGE fileType', async () => {
            sharpMock.mockReturnValue({
                metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
            });

            const result = await service.validateFile(bufferFile('image/jpeg') as any, 'user-1');

            expect(result.fileType).toBe(FileType.IMAGE);
        });

        it('routes audio/* MIME to the audio validator and returns AUDIO fileType', async () => {
            ffprobeMock.mockResolvedValue({ streams: [{ duration: 60 }] });
            // storage check (1st call) + audio duration check (2nd call) both allowed
            paymentClient.checkUsage.mockResolvedValue({ allowed: true, limit: 'unlimited' });

            const result = await service.validateFile(pathFile('audio/mpeg', 'track', 'mp3') as any, 'user-1');

            expect(result.fileType).toBe(FileType.AUDIO);
        });
    });

    // ---------------------------------------------------------------------------
    // video validation
    // ---------------------------------------------------------------------------

    describe('video validation', () => {
        it('returns a FileValidationResult with duration for a valid video file', async () => {
            ffprobeMock.mockResolvedValue({ streams: [{ duration: 300.5 }] });
            paymentClient.checkUsage.mockResolvedValue({ allowed: true });

            const result = await service.validateFile(pathFile('video/mp4') as any, 'user-1');

            expect(result).toMatchObject({
                isValid: true,
                fileType: FileType.VIDEO,
                metadata: {
                    duration: 301, // Math.ceil(300.5)
                    size: 1024,
                },
            });
        });

        it('throws ForbiddenException when video duration exceeds the plan limit', async () => {
            ffprobeMock.mockResolvedValue({ streams: [{ duration: 700 }] });
            paymentClient.checkUsage
                .mockResolvedValueOnce({ allowed: true })          // storage check passes
                .mockResolvedValueOnce({ allowed: false, limit: 600 }); // video length check fails

            await expect(
                service.validateFile(pathFile('video/mp4', 'long') as any, 'user-1'),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    // ---------------------------------------------------------------------------
    // image validation
    // ---------------------------------------------------------------------------

    describe('image validation', () => {
        it('returns a FileValidationResult with width and height for a valid image', async () => {
            sharpMock.mockReturnValue({
                metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
            });

            const result = await service.validateFile(bufferFile('image/png', 'photo', 'png') as any, 'user-1');

            expect(result).toMatchObject({
                isValid: true,
                fileType: FileType.IMAGE,
                metadata: { width: 1920, height: 1080, size: 2048 },
            });
        });
    });

    // ---------------------------------------------------------------------------
    // audio validation
    // ---------------------------------------------------------------------------

    describe('audio validation', () => {
        it('returns a FileValidationResult with duration for a valid audio file', async () => {
            ffprobeMock.mockResolvedValue({ streams: [{ duration: 180 }] });
            // storage check (1st call) allowed; audio duration check (2nd call) allowed
            paymentClient.checkUsage.mockResolvedValue({ allowed: true, limit: 3600 });

            const result = await service.validateFile(pathFile('audio/mpeg', 'track', 'mp3') as any, 'user-1');

            expect(result).toMatchObject({
                isValid: true,
                fileType: FileType.AUDIO,
                metadata: { duration: 180, size: 1024 },
            });
        });

        it('throws ForbiddenException when audio duration exceeds the plan limit', async () => {
            ffprobeMock.mockResolvedValue({ streams: [{ duration: 4000 }] });
            paymentClient.checkUsage
                .mockResolvedValueOnce({ allowed: true, limit: 'unlimited' }) // storage check passes
                .mockResolvedValueOnce({ allowed: false, limit: 3600 });      // audio duration check fails

            await expect(
                service.validateFile(pathFile('audio/mpeg', 'long', 'mp3') as any, 'user-1'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('skips duration enforcement when plan has unlimited audio duration', async () => {
            ffprobeMock.mockResolvedValue({ streams: [{ duration: 999_999 }] });
            // Both storage and audio duration checks return allowed: true with unlimited limit
            paymentClient.checkUsage.mockResolvedValue({ allowed: true, limit: 'unlimited' });

            const result = await service.validateFile(pathFile('audio/mpeg', 'unlimited', 'mp3') as any, 'user-1');

            expect(result.isValid).toBe(true);
        });
    });

    // ---------------------------------------------------------------------------
    // MIME → FileType mapping edge cases
    // ---------------------------------------------------------------------------

    describe('MIME type mapping edge cases', () => {
        it('maps application/vnd.openxmlformats-officedocument.wordprocessingml.document to DOCUMENT and blocks it', async () => {
            const file = {
                mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                size: 1024,
                originalname: 'report.docx',
            };

            await expect(service.validateFile(file as any, 'user-1')).rejects.toThrow(BadRequestException);
        });
    });
});
