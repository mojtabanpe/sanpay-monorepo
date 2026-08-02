import { Injectable } from '@nestjs/common';
import { Receipt } from '@sanpay/models';
import { Observable, Subject, filter } from 'rxjs';

interface StorePaymentEvent {
  storeId: string;
  receipt: Receipt;
}

/**
 * گذرگاه رویداد در حافظه — به‌محض ثبت پرداخت، رسید را به استریم SSE پنل آن
 * فروشگاه می‌رساند. چون in-memory است فقط با یک نمونهٔ API کار می‌کند؛ برای
 * اجرای چندنمونه‌ای باید به Redis pub/sub تبدیل شود.
 */
@Injectable()
export class PaymentEventsService {
  private readonly events = new Subject<StorePaymentEvent>();

  emit(storeId: string, receipt: Receipt): void {
    this.events.next({ storeId, receipt });
  }

  /** رسیدهای زندهٔ یک فروشگاه */
  forStore(storeId: string): Observable<Receipt> {
    return new Observable<Receipt>((subscriber) => {
      const subscription = this.events
        .pipe(filter((event) => event.storeId === storeId))
        .subscribe((event) => subscriber.next(event.receipt));
      return () => subscription.unsubscribe();
    });
  }
}
