import { HlmToaster } from '@sanpay/ui/sonner';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ConfirmHost } from './core/confirm';

@Component({
  imports: [RouterModule, ConfirmHost, HlmToaster],
  selector: 'app-root',
  template: `<router-outlet /><app-confirm-host />
    <hlm-toaster
      position="top-center"
      [closeButton]="true"
      [richColors]="true"
    />`,
})
export class App {}
