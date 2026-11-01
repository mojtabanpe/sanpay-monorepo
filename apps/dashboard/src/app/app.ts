import { HlmToaster } from '@sanpay/ui/sonner';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ConfirmHost } from './core/confirm';

@Component({
  imports: [RouterModule, ConfirmHost, HlmToaster],
  selector: 'app-root',
  template: `<router-outlet /><app-confirm-host />
    <hlm-toaster
      class="dashboard-toasts"
      position="top-center"
      [closeButton]="true"
      [richColors]="false"
    />`,
})
export class App {}
