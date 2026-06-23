import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationService } from './authentication.service';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitmqService, UserEventType } from 'src/common/services/rabbitmq.service';
import { AuthUser } from './types/user.type';

const mockUser: AuthUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    emailVerified: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
};

describe('AuthenticationService', () => {
    let service: AuthenticationService;
    let prisma: { user: { findUnique: jest.Mock; deleteMany: jest.Mock } };
    let rabbitmq: { publishEvent: jest.Mock };

    beforeEach(async () => {
        prisma = {
            user: {
                findUnique: jest.fn(),
                deleteMany: jest.fn(),
            },
        };
        rabbitmq = { publishEvent: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthenticationService,
                { provide: PrismaService, useValue: prisma },
                { provide: RabbitmqService, useValue: rabbitmq },
            ],
        }).compile();

        service = module.get<AuthenticationService>(AuthenticationService);
    });

    afterEach(() => jest.clearAllMocks());

    describe('findUserByEmail', () => {
        it('returns the user when found', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);

            const result = await service.findUserByEmail('test@example.com');

            expect(result).toEqual(mockUser);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { email: 'test@example.com' },
                select: expect.objectContaining({ id: true, email: true }),
            });
        });

        it('returns null when user is not found', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            const result = await service.findUserByEmail('missing@example.com');

            expect(result).toBeNull();
        });
    });

    describe('findUserById', () => {
        it('returns the user when found', async () => {
            prisma.user.findUnique.mockResolvedValue(mockUser);

            const result = await service.findUserById('user-123');

            expect(result).toEqual(mockUser);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                select: expect.objectContaining({ id: true, email: true }),
            });
        });

        it('returns null when user is not found', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            const result = await service.findUserById('missing-id');

            expect(result).toBeNull();
        });
    });

    describe('deleteUserAccount', () => {
        it('deletes the user and publishes a USER_DELETED event', async () => {
            prisma.user.deleteMany.mockResolvedValue({ count: 1 });
            rabbitmq.publishEvent.mockResolvedValue(undefined);

            await service.deleteUserAccount('user-123', mockUser);

            expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: 'user-123' } });
            expect(rabbitmq.publishEvent).toHaveBeenCalledWith({
                type: UserEventType.USER_DELETED,
                user: mockUser,
                timestamp: expect.any(Date),
            });
        });

        it('skips publishing when the user record does not exist', async () => {
            prisma.user.deleteMany.mockResolvedValue({ count: 0 });

            await service.deleteUserAccount('nonexistent-id', mockUser);

            expect(rabbitmq.publishEvent).not.toHaveBeenCalled();
        });
    });
});
