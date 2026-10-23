import { Injectable, OnModuleInit } from '@nestjs/common';
import { UpgResult } from '@sanpay/models';
import { PaymentIntent } from '../../generated/prisma/client';
import { UpgService } from '../upg/upg.service';
import { UpgFulfiller } from '../upg/upg.types';
import { PaymentsService } from './payments.service';

/** خرید فروشگاهی (QR یا OTP پنل فروشگاه) روی UPG */
@Injectable()
export class StorePaymentFulfiller implements UpgFulfiller, OnModuleInit {
  readonly purpose = 'STORE' as const;

  constructor(
    private readonly upg: UpgService,
    private readonly payments: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.upg.register(this);
  }

  fulfill(intent: PaymentIntent): Promise<void> {
    return this.payments.completeFromIntent(intent);
  }

  /** خرید فروشگاهی چیزی را نگه نمی‌دارد */
  async abandon(): Promise<void> {
    return;
  }

  async result(intent: PaymentIntent): Promise<UpgResult> {
    return {
      kind: 'store-receipt',
      receipt: await this.payments.receiptForIntent(intent.id),
    };
  }

  backPath(): string {
    return '/qr';
  }
}
