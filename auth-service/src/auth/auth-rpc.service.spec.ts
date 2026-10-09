import { Status } from '@ragspace/shared-ts';
import { AuthRpcService } from './auth-rpc.service';
import { UsersService } from './users.service';

jest.mock('../../auth', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('../events/event-bus', () => ({ eventBus: { publish: jest.fn() } }));

import { auth } from '../../auth';
import { eventBus } from '../events/event-bus';

const getSession = auth.api.getSession as unknown as jest.Mock;
const publish = eventBus.publish as jest.Mock;

const user = {
    id: 'u1',
    email: 'a@b.co',
    name: 'Ada',
    username: null,
    image: null,
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
};

describe('AuthRpcService', () => {
    let users: jest.Mocked<Pick<UsersService, 'findById' | 'update' | 'delete'>>;
    let service: AuthRpcService;

    beforeEach(() => {
        jest.clearAllMocks();
        users = { findById: jest.fn(), update: jest.fn(), delete: jest.fn() };
        service = new AuthRpcService(users as unknown as UsersService);
    });

    it('rejects a missing session as UNAUTHENTICATED', async () => {
        getSession.mockResolvedValue(null);
        await expect(service.validateSession({ cookie: 'x=1', authorization: '' })).rejects.toMatchObject({
            code: Status.UNAUTHENTICATED,
        });
    });

    it('forwards cookie and authorization headers and maps the session', async () => {
        getSession.mockResolvedValue({
            user,
            session: { id: 's1', userId: 'u1', expiresAt: '2026-02-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
        });
        const result = await service.validateSession({ cookie: 'c=1', authorization: 'Bearer t' });
        const headers: Headers = getSession.mock.calls[0][0].headers;
        expect(headers.get('cookie')).toBe('c=1');
        expect(headers.get('authorization')).toBe('Bearer t');
        expect(getSession.mock.calls[0][0].query).toEqual({ disableCookieCache: true });
        expect(result.user).toMatchObject({ id: 'u1', username: undefined, imageUrl: undefined });
        expect(result.session?.createTime).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it('returns NOT_FOUND for an unknown user', async () => {
        users.findById.mockResolvedValue(null);
        await expect(service.getUser({ userId: 'nope' })).rejects.toMatchObject({ code: Status.NOT_FOUND });
    });

    it('clears the username when an empty string is sent', async () => {
        users.update.mockResolvedValue({ ...user, name: 'Bea' });
        await service.updateUser({ userId: 'u1', name: 'Bea', username: '' });
        expect(users.update).toHaveBeenCalledWith('u1', { name: 'Bea', username: null });
    });

    it('publishes user.deleted after deleting the account', async () => {
        users.delete.mockResolvedValue(true);
        await service.deleteUser({ userId: 'u1' });
        expect(publish).toHaveBeenCalledWith({ $case: 'userDeleted', userDeleted: { userId: 'u1' } });
    });

    it('does not publish when the user does not exist', async () => {
        users.delete.mockResolvedValue(false);
        await expect(service.deleteUser({ userId: 'u1' })).rejects.toMatchObject({ code: Status.NOT_FOUND });
        expect(publish).not.toHaveBeenCalled();
    });
});
