import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { alreadyExists, notFound } from '@ragspace/shared-ts';
import { PrismaService } from '../prisma/prisma.service';

export const USER_SELECT = {
    id: true,
    email: true,
    name: true,
    username: true,
    image: true,
    emailVerified: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) { }

    findById(id: string): Promise<UserRecord | null> {
        return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    }

    async update(id: string, data: { name?: string; username?: string | null }): Promise<UserRecord> {
        try {
            return await this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') throw alreadyExists('Username is already taken');
                if (error.code === 'P2025') throw notFound('User');
            }
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.prisma.user.deleteMany({ where: { id } });
        return result.count > 0;
    }
}
