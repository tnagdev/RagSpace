import { Module, Global } from '@nestjs/common';
import { LemonSqueezyService } from './lemon-squeezy/lemon-squeezy.service';
import { RazorpayService } from './razorpay/razorpay.service';
import { PaymentProviderFactory } from './payment-provider.factory';

@Global()
@Module({
    providers: [LemonSqueezyService, RazorpayService, PaymentProviderFactory],
    exports: [LemonSqueezyService, RazorpayService, PaymentProviderFactory],
})
export class ProvidersModule { }
