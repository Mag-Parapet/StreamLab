import { inject } from "@angular/core";
import { CanActivateFn, Router, Routes } from "@angular/router";
import { Api } from "./api";
const authenticated: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  return (await api.checkSession()) || router.createUrlTree(["/login"]);
};
export const routes: Routes = [
  {
    path: "login",
    loadComponent: () => import("./login").then((m) => m.LoginPage),
  },
  {
    path: "",
    canActivate: [authenticated],
    loadComponent: () => import("./shell").then((m) => m.Shell),
    children: [
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
      {
        path: "dashboard",
        loadComponent: () => import("./overview").then((m) => m.Overview),
      },
      {
        path: "live",
        loadComponent: () => import("./overview").then((m) => m.Overview),
      },
      {
        path: "destinations",
        loadComponent: () =>
          import("./destinations").then((m) => m.DestinationsPage),
      },
      {
        path: "server",
        loadComponent: () => import("./system").then((m) => m.SystemPage),
      },
      {
        path: "storage",
        loadComponent: () => import("./system").then((m) => m.SystemPage),
      },
      {
        path: "recordings",
        loadComponent: () =>
          import("./recordings").then((m) => m.RecordingsPage),
      },
      {
        path: "logs",
        loadComponent: () => import("./logs").then((m) => m.LogsPage),
      },
      {
        path: "settings",
        loadComponent: () => import("./settings").then((m) => m.SettingsPage),
      },
    ],
  },
  { path: "**", redirectTo: "dashboard" },
];
