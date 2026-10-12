import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ConfirmHost } from './core/confirm';

@Component({
  imports: [RouterModule, ConfirmHost],
  selector: 'app-root',
  template: '<router-outlet /><app-confirm-host />',
})
export class App {}
