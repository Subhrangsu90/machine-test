import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
// Task 5: uncomment once core/auth/auth.interceptor.ts exists.
// import { authInterceptor } from './core/auth/auth.interceptor';

// Zoneless change detection is the default in Angular v21+ (zone.js is not installed),
// so provideZonelessChangeDetection() is not needed.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(/* , withInterceptors([authInterceptor]) */),
  ],
};
