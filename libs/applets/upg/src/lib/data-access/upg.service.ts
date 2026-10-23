import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { UpgIntentView, UpgLine, UpgPayResponse } from '@sanpay/models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UpgService {
  private readonly http = inject(HttpClient);

  view(intentId: string): Observable<UpgIntentView> {
    return this.http.get<UpgIntentView>(`/api/upg/intents/${intentId}`);
  }

  pay(intentId: string, lines: UpgLine[]): Observable<UpgPayResponse> {
    return this.http.post<UpgPayResponse>(`/api/upg/intents/${intentId}/pay`, {
      lines,
    });
  }

  cancel(intentId: string): Observable<UpgIntentView> {
    return this.http.post<UpgIntentView>(
      `/api/upg/intents/${intentId}/cancel`,
      {},
    );
  }
}
