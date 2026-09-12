import { bootstrapApplication } from "@angular/platform-browser";
import { provideZonelessChangeDetection } from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { AppComponent } from "./app/app";
import { routes } from "./app/routes";
import { requestProtection } from "./app/api";
bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([requestProtection])),
    provideRouter(routes),
  ],
}).catch(console.error);
