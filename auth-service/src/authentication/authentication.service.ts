import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthenticationService {
    protected readonly logger = new Logger(AuthenticationService.name);
    constructor(private prisma: PrismaService) { }

    async findUserByUsername(username: string) {
        return this.prisma.user.findFirst({
            where: { username }
        });
    }

    async findUserByEmail(email: string) {
        return this.prisma.user.findFirst({
            where: { email }
        });
    }

    async updateUserUsername(userId: string, username: string) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { username }
        });
    }
}
