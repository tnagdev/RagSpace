jest.mock('../../auth', () => ({
    auth: {
        api: {
            signInEmail: jest.fn(),
            signUpEmail: jest.fn(),
            signInSocial: jest.fn(),
            getSession: jest.fn(),
            changePassword: jest.fn(),
            forgetPassword: jest.fn(),
        },
    },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auth } from '../../auth';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { PaymentService } from 'src/common/services/payment.service';
import { AuthUser } from './types/user.type';

// Cast through any so jest.Mock methods are accessible without fighting better-auth's generic types
const authApi = (auth as any).api as Record<string, jest.Mock>;

const mockUser: AuthUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    emailVerified: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
};

function createMockRes(): jest.Mocked<Pick<Response, 'status' | 'json' | 'setHeaders' | 'setHeader'>> & { [key: string]: any } {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeaders = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
    return { headers: {}, query: {}, ...overrides } as unknown as Request;
}

describe('AuthenticationController', () => {
    let controller: AuthenticationController;
    let authService: jest.Mocked<Pick<AuthenticationService, 'findUserByEmail' | 'findUserById' | 'deleteUserAccount'>>;
    let paymentService: jest.Mocked<Pick<PaymentService, 'createFreeSubscription'>>;
    let loggerErrorSpy: jest.SpyInstance;

    beforeAll(() => {
        // Suppress NestJS logger output so error-path tests don't pollute the test report.
        // loggerErrorSpy is exposed so individual tests can assert it was called.
        loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    });

    afterAll(() => jest.restoreAllMocks());

    beforeEach(async () => {
        authService = {
            findUserByEmail: jest.fn(),
            findUserById: jest.fn(),
            deleteUserAccount: jest.fn(),
        };
        paymentService = {
            createFreeSubscription: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthenticationController],
            providers: [
                { provide: AuthenticationService, useValue: authService },
                { provide: PaymentService, useValue: paymentService },
            ],
        }).compile();

        controller = module.get<AuthenticationController>(AuthenticationController);
    });

    afterEach(() => jest.clearAllMocks());

    // ──────────────────────────────────────────────────────────────
    // POST /auth/signin
    // ──────────────────────────────────────────────────────────────

    describe('signIn', () => {
        const validBody = { email: 'test@example.com', password: 'Password123!' };

        it('returns auth response on successful sign-in', async () => {
            const mockApiResult = {
                headers: {},
                json: jest.fn().mockResolvedValue({ token: 'abc123' }),
            };
            authApi.signInEmail.mockResolvedValue(mockApiResult);

            const res = createMockRes();
            await controller.signIn(validBody as any, createMockReq(), res as any);

            expect(authApi.signInEmail).toHaveBeenCalledWith({
                body: { email: 'test@example.com', password: 'Password123!' },
                asResponse: true,
            });
            expect(res.setHeaders).toHaveBeenCalledWith(mockApiResult.headers);
            expect(res.json).toHaveBeenCalledWith({ token: 'abc123' });
        });

        it('returns 401 when auth.api.signInEmail returns falsy', async () => {
            authApi.signInEmail.mockResolvedValue(null);

            const res = createMockRes();
            await controller.signIn(validBody as any, createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
        });

        it('returns 500 and logs the error on unexpected exception', async () => {
            authApi.signInEmail.mockRejectedValue(new Error('DB error'));

            const res = createMockRes();
            await controller.signIn(validBody as any, createMockReq(), res as any);

            expect(loggerErrorSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Internal server error' }),
            );
        });
    });

    // ──────────────────────────────────────────────────────────────
    // POST /auth/signup
    // ──────────────────────────────────────────────────────────────

    describe('signUp', () => {
        const validBody = {
            email: 'new@example.com',
            password: 'Password123!',
            firstName: 'John',
            lastName: 'Doe',
        };

        it('creates account and free subscription on success', async () => {
            authService.findUserByEmail.mockResolvedValue(null);
            const mockApiResult = {
                headers: {},
                status: 201,
                json: jest.fn().mockResolvedValue({ user: { id: 'user-456', email: 'new@example.com' } }),
            };
            authApi.signUpEmail.mockResolvedValue(mockApiResult);
            paymentService.createFreeSubscription.mockResolvedValue(undefined);

            const res = createMockRes();
            await controller.signUp(validBody as any, createMockReq(), res as any);

            expect(paymentService.createFreeSubscription).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'user-456' }),
            );
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('returns 400 when an account already exists for the email', async () => {
            authService.findUserByEmail.mockResolvedValue(mockUser);

            const res = createMockRes();
            await controller.signUp(validBody as any, createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Already an account exists with this email',
            });
        });

        it('returns 400 when auth.api.signUpEmail returns falsy', async () => {
            authService.findUserByEmail.mockResolvedValue(null);
            authApi.signUpEmail.mockResolvedValue(null);

            const res = createMockRes();
            await controller.signUp(validBody as any, createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create account' });
        });

        it('returns 500 and logs the error on unexpected exception', async () => {
            authService.findUserByEmail.mockResolvedValue(null);
            authApi.signUpEmail.mockRejectedValue(new Error('DB error'));

            const res = createMockRes();
            await controller.signUp(validBody as any, createMockReq(), res as any);

            expect(loggerErrorSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // ──────────────────────────────────────────────────────────────
    // GET /auth/me
    // ──────────────────────────────────────────────────────────────

    describe('getProfile', () => {
        it('returns user profile when authenticated', async () => {
            const res = createMockRes();
            await controller.getProfile(mockUser, res as any);

            expect(res.json).toHaveBeenCalledWith({ user: mockUser });
        });

        it('returns 401 when user is not authenticated', async () => {
            const res = createMockRes();
            await controller.getProfile(null, res as any);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
        });
    });

    // ──────────────────────────────────────────────────────────────
    // GET /auth/session
    // ──────────────────────────────────────────────────────────────

    describe('getSession', () => {
        it('returns session data when a valid session exists', async () => {
            const mockSession = { user: mockUser, session: { id: 'session-1' } };
            authApi.getSession.mockResolvedValue(mockSession);

            const res = createMockRes();
            await controller.getSession(createMockReq({ headers: { cookie: 'session=abc' } as any }), res as any);

            expect(res.json).toHaveBeenCalledWith(mockSession);
        });

        it('returns 401 when getSession returns null', async () => {
            authApi.getSession.mockResolvedValue(null);

            const res = createMockRes();
            await controller.getSession(createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'No active session' });
        });

        it('returns 401 and logs the error when getSession throws', async () => {
            authApi.getSession.mockRejectedValue(new Error('Token expired'));

            const res = createMockRes();
            await controller.getSession(createMockReq(), res as any);

            expect(loggerErrorSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired session' });
        });
    });

    // ──────────────────────────────────────────────────────────────
    // GET /auth/health
    // ──────────────────────────────────────────────────────────────

    describe('getHealth', () => {
        it('returns 200 with status ok', () => {
            const res = createMockRes();
            controller.getHealth(res as any);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ok', timestamp: expect.any(String) }),
            );
        });
    });

    // ──────────────────────────────────────────────────────────────
    // POST /auth/change-password
    // ──────────────────────────────────────────────────────────────

    describe('changePassword', () => {
        const validBody = { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' };

        it('returns a success message when password is changed', async () => {
            authApi.changePassword.mockResolvedValue({ success: true });

            const res = createMockRes();
            await controller.changePassword(mockUser, validBody as any, createMockReq(), res as any);

            expect(res.json).toHaveBeenCalledWith({ message: 'Password changed successfully' });
        });

        it('returns 401 when no authenticated user', async () => {
            const res = createMockRes();
            await controller.changePassword(null, validBody as any, createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
        });

        it('returns 400 when auth.api.changePassword returns falsy', async () => {
            authApi.changePassword.mockResolvedValue(null);

            const res = createMockRes();
            await controller.changePassword(mockUser, validBody as any, createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Failed to change password' });
        });

        it('returns 400 with user-friendly message and logs when current password is incorrect', async () => {
            authApi.changePassword.mockRejectedValue(new Error('Password is incorrect'));

            const res = createMockRes();
            await controller.changePassword(mockUser, validBody as any, createMockReq(), res as any);

            expect(loggerErrorSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
        });
    });

    // ──────────────────────────────────────────────────────────────
    // POST /auth/forgot-password
    // ──────────────────────────────────────────────────────────────

    describe('forgotPassword', () => {
        it('sends reset email and returns status true', async () => {
            authService.findUserByEmail.mockResolvedValue(mockUser);
            authApi.forgetPassword.mockResolvedValue(undefined);

            const res = createMockRes();
            await controller.forgotPassword({ email: 'test@example.com' }, createMockReq(), res as any);

            expect(authApi.forgetPassword).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ status: true });
        });

        // empty / invalid email is rejected by ForgotPasswordDto + global ValidationPipe before reaching here

        it('returns 404 when no account exists for the email', async () => {
            authService.findUserByEmail.mockResolvedValue(null);

            const res = createMockRes();
            await controller.forgotPassword({ email: 'unknown@example.com' }, createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                error: 'No account found with this email address',
            });
        });

        it('returns 500 and logs the error on unexpected exception', async () => {
            authService.findUserByEmail.mockRejectedValue(new Error('DB error'));

            const res = createMockRes();
            await controller.forgotPassword({ email: 'test@example.com' }, createMockReq(), res as any);

            expect(loggerErrorSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
        });
    });

    // ──────────────────────────────────────────────────────────────
    // DELETE /auth/account
    // ──────────────────────────────────────────────────────────────

    describe('deleteAccount', () => {
        it('deletes account and returns a success message', async () => {
            authService.deleteUserAccount.mockResolvedValue(undefined);

            const res = createMockRes();
            await controller.deleteAccount(mockUser, createMockReq(), res as any);

            expect(authService.deleteUserAccount).toHaveBeenCalledWith('user-123', mockUser);
            expect(res.json).toHaveBeenCalledWith({ message: 'Account deleted successfully' });
        });

        it('returns 401 when no authenticated user', async () => {
            const res = createMockRes();
            await controller.deleteAccount(null, createMockReq(), res as any);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
        });

        it('returns 500 and logs the error on delete failure', async () => {
            authService.deleteUserAccount.mockRejectedValue(new Error('Delete failed'));

            const res = createMockRes();
            await controller.deleteAccount(mockUser, createMockReq(), res as any);

            expect(loggerErrorSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Failed to delete account' }),
            );
        });
    });
});
