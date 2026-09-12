import { Component, inject, signal, OnInit, OnDestroy } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { Api } from "./api";
import { Icon } from "./icon";
@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icon],
  template: `<div class="app-layout">
    <aside class="sidebar" [class.mobile-open]="menu()">
      <a class="brand" routerLink="/dashboard"
        ><span class="brand-mark"><app-icon name="signal" /></span>signal<span
          class="brand-dot"
          >.</span
        ></a
      ><span class="workspace-label">STREAMING CONTROL CENTER</span>
      <div class="workspace-card">
        <span class="server-symbol"><app-icon name="server" /></span>
        <div>
          <strong>{{
            api.settings()?.preferences?.server_name || "Streaming server"
          }}</strong
          ><small>Self-hosted workspace</small>
        </div>
        <span
          class="tiny-dot"
          [class.healthy]="api.snapshot()?.stream?.engine_online"
        ></span>
      </div>
      <div class="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        @for (item of nav; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="selected"
            (click)="menu.set(false)"
            ><app-icon [name]="item.icon" /><span>{{ item.label }}</span>
            @if (
              item.path === "/live" && api.snapshot()?.stream?.obs_connected
            ) {
              <span class="tiny-dot healthy"></span>
            }
          </a>
        }
      </nav>
      <div class="sidebar-bottom">
        <div class="engine-label">
          <span
            class="tiny-dot"
            [class.healthy]="api.snapshot()?.stream?.engine_online"
          ></span
          >MediaMTX<span>{{
            api.snapshot()?.stream?.engine_online ? "Online" : "Unavailable"
          }}</span>
        </div>
        <div class="sidebar-rule"></div>
        <button
          aria-label="Sign out"
          class="user-button"
          (click)="api.logout()"
        >
          <span class="avatar">{{
            api.user()?.slice(0, 1)?.toUpperCase()
          }}</span
          ><span
            ><strong>{{ api.user() }}</strong
            ><small>Administrator</small></span
          ><app-icon name="logout" />
        </button>
      </div>
    </aside>
    <section class="main-shell">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="icon-button mobile-toggle"
            aria-label="Toggle navigation"
            (click)="menu.set(!menu())"
          >
            <app-icon name="menu" /></button
          ><span
            class="tiny-dot"
            [class.healthy]="api.connection() === 'connected'"
          ></span
          ><span>{{
            api.settings()?.preferences?.server_name || "Streaming server"
          }}</span
          ><span class="top-divider">/</span
          ><span class="muted">Control center</span>
        </div>
        <div class="topbar-right">
          <span
            class="connection-label"
            [class.text-green]="api.connection() === 'connected'"
            >{{
              api.connection() === "connected"
                ? "Realtime connected"
                : api.connection() === "reconnecting"
                  ? "Reconnecting…"
                  : "Connecting…"
            }}</span
          ><span class="version">v0.1</span>
        </div>
      </header>
      <main class="page-content">
        @if (api.error()) {
          <div class="notice error" role="alert">
            {{ api.error()
            }}<button
              class="icon-button"
              (click)="api.error.set('')"
              aria-label="Dismiss error"
            >
              <app-icon name="close" />
            </button>
          </div>
        }
        @if (api.connection() === "reconnecting") {
          <div class="notice warning">
            Realtime connection interrupted. Displayed readings may be stale;
            retrying automatically.
          </div>
        }
        <router-outlet />
      </main>
      <footer class="page-footer">
        <span>Signal control center</span
        ><span
          >Built for your infrastructure <span class="tiny-dot healthy"></span
        ></span>
      </footer>
    </section>
  </div>`,
})
export class Shell implements OnInit, OnDestroy {
  api = inject(Api);
  menu = signal(false);
  nav = [
    { path: "/dashboard", label: "Dashboard", icon: "grid" },
    { path: "/live", label: "Live", icon: "live" },
    { path: "/destinations", label: "Destinations", icon: "destinations" },
    { path: "/recordings", label: "Recordings", icon: "recordings" },
    { path: "/storage", label: "Storage", icon: "storage" },
    { path: "/server", label: "Server", icon: "server" },
    { path: "/logs", label: "Logs", icon: "logs" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ];
  ngOnInit() {
    void this.api.start();
  }
  ngOnDestroy() {
    this.api.stop();
  }
}
