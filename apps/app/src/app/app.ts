import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IdleSessionService } from './core/idle-session.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {
  constructor() {
    inject(IdleSessionService);
  }
}
