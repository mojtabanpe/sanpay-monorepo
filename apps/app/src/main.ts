import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';

const splashStartedAt = Number(
  document.getElementById('sanpay-splash')?.dataset['startedAt'] ??
    performance.now(),
);

function signalBoot(state: 'ready' | 'failed'): void {
  document.documentElement.dataset['sanpayBoot'] = state;
  document.dispatchEvent(new Event(`sanpay:${state}`));
  // A failed splash-script download must not hide a successfully loaded app.
  const splash = document.getElementById('sanpay-splash');
  if (state === 'ready' && !splash?.dataset['managed']) {
    splash?.remove();
    document.querySelector('app-root')?.removeAttribute('inert');
    document.body.classList.remove('splash-active');
  }
}

bootstrapApplication(App, appConfig)
  .then(async (app) => {
    const router = app.injector.get(Router);
    if (!router.navigated) {
      await firstValueFrom(
        router.events.pipe(
          filter((event) => event instanceof NavigationEnd),
          take(1),
        ),
      );
    }
    // Keep the development splash visible for at least three seconds.
    if (isDevMode()) {
      const remaining = 3000 - (performance.now() - splashStartedAt);
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
    }
    // Let the initial lazy route paint before fading away the splash.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => signalBoot('ready')),
    );
  })
  .catch((error) => {
    console.error(error);
    signalBoot('failed');
  });
