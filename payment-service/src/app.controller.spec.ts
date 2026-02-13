import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
    let appController: AppController;

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            controllers: [AppController],
        }).compile();

        appController = app.get<AppController>(AppController);
    });

    describe('root', () => {
        it('should return service status', () => {
            const result = appController.getStatus();
            expect(result).toHaveProperty('service', 'Payment Service');
            expect(result).toHaveProperty('status', 'running');
        });
    });

    describe('health', () => {
        it('should return health check', () => {
            const result = appController.healthCheck();
            expect(result).toHaveProperty('status', 'ok');
            expect(result).toHaveProperty('timestamp');
        });
    });
});
