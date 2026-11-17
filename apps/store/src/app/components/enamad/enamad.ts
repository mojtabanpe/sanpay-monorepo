import { Component, DOCUMENT, inject, signal } from '@angular/core';

@Component({
  selector: 'store-enamad',
  imports: [],
  templateUrl: './enamad.html',
})
export class Enamad {
  private readonly hostname = inject(DOCUMENT).location?.hostname ?? '';
  protected readonly seal = this.hostname === 'store.sanpai.ir'
    ? { id: '8757327', code: '5sNv9NIWqFo9HGMYrTapsjCZHWFhitBV' }
    : this.hostname === 'store.sanpayco.com'
      ? { id: '8595402', code: 'h4GsUuRrFcmZ9duBk66SrNnHCzcvKI0U' }
      : null;
  protected readonly imageFailed = signal(false);
}
