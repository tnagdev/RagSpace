import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LemonSqueezyService } from './lemon-squeezy/lemon-squeezy.service';
import { RazorpayService } from './razorpay/razorpay.service';
import { IPaymentProvider } from './payment-provider.interface';

export type PaymentProviderName = 'lemon-squeezy' | 'razorpay';

@Injectable()
export class PaymentProviderFactory {
    private readonly logger = new Logger(PaymentProviderFactory.name);
    private readonly providerName: PaymentProviderName;

    constructor(
        private configService: ConfigService,
        private lemonSqueezy: LemonSqueezyService,
        private razorpay: RazorpayService,
    ) {
        this.providerName = (
            this.configService.get<string>('PAYMENT_PROVIDER', 'lemon-squeezy') as PaymentProviderName
        );
        this.logger.log(`💳 Active payment provider: ${this.providerName}`);
    }

    getProvider(): IPaymentProvider {
        switch (this.providerName) {
            case 'razorpay':
                return this.razorpay;
            case 'lemon-squeezy':
            default:
                return this.lemonSqueezy;
        }
    }

    getProviderName(): PaymentProviderName {
        return this.providerName;
    }
}
