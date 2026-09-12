import { Component, inject, signal, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink, Router } from "@angular/router";
import { Api } from "./api";
import { Settings, Preferences } from "./models";
import { Icon } from "./icon";
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, Icon],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">WORKSPACE / PREFERENCES</div>
        <h1>Settings<span class="heading-dot"></span></h1>
        <p>Make your control center work for you.</p>
      </div>
    </div>
    @if (preferences; as p) {
      <form (ngSubmit)="save()">
        <div class="settings-layout">
          <section class="panel settings-section">
            <div class="section-description">
              <app-icon name="signal" />
              <h2>Streaming</h2>
              <p>
                Reference settings for OBS. Encoding stays in OBS; the server
                forwards media unchanged.
              </p>
            </div>
            <div class="form-grid">
              <label
                >Input protocol<input
                  [value]="p.input_protocol.toUpperCase()"
                  disabled
                /><small>Managed in Docker Compose</small></label
              ><label>Input port<input [value]="p.input_port" disabled /></label
              ><label
                >Default bitrate (Kbps)<input
                  name="bitrate"
                  type="number"
                  [(ngModel)]="p.default_bitrate"
                  min="100"
                  max="100000"
                  required /></label
              ><label
                >Default resolution<input
                  name="resolution"
                  [(ngModel)]="p.default_resolution"
                  maxlength="32"
                  required /></label
              ><label
                >Default FPS<input
                  name="fps"
                  type="number"
                  [(ngModel)]="p.default_fps"
                  min="1"
                  max="120"
                  required
              /></label>
            </div>
          </section>
          <section class="panel settings-section">
            <div class="section-description">
              <app-icon name="server" />
              <h2>Server</h2>
              <p>Workspace identity and connected services.</p>
            </div>
            <div class="form-grid">
              <label class="span-2"
                >Server name<input
                  name="server_name"
                  [(ngModel)]="p.server_name"
                  required
                  maxlength="80" /></label
              ><label class="span-2"
                >File Browser URL<input
                  name="file_browser_url"
                  type="url"
                  [(ngModel)]="p.file_browser_url"
                  required /></label
              ><label class="span-2"
                >MediaMTX API address<input
                  [value]="infrastructure()?.mediamtx_api_url"
                  disabled
                /><small
                  >Set MEDIAMTX_API_URL in the server environment and recreate
                  the backend.</small
                ></label
              ><label class="span-2"
                >MediaMTX RTSP address<input
                  [value]="infrastructure()?.mediamtx_rtsp_url"
                  disabled
              /></label>
            </div>
          </section>
          <section class="panel settings-section">
            <div class="section-description">
              <app-icon name="shield" />
              <h2>Session settings</h2>
              <p>Control the lifetime of new dashboard sessions.</p>
            </div>
            <div class="form-grid">
              <label
                >Session duration (hours)<input
                  name="session_hours"
                  type="number"
                  [(ngModel)]="p.session_hours"
                  min="1"
                  max="168"
                  required
              /></label>
              <p class="span-2 footnote">
                The REST API uses the same protected session as the dashboard.
                API keys are not enabled in this version.
              </p>
            </div>
          </section>
        </div>
        <div class="settings-save">
          @if (message()) {
            <span class="text-green" role="status">{{ message() }}</span>
          }
          <button class="button primary" [disabled]="busy()">
            {{ busy() ? "Saving…" : "Save settings" }}
          </button>
        </div>
      </form>
      <section class="panel settings-section">
        <div class="section-description">
          <app-icon name="destinations" />
          <h2>Destinations</h2>
          <p>Configure YouTube, Facebook, and custom RTMP outputs.</p>
        </div>
        <div>
          <a routerLink="/destinations" class="button subtle"
            >Manage destinations<app-icon name="arrow"
          /></a>
        </div>
      </section>
      <section class="panel settings-section">
        <div class="section-description">
          <app-icon name="shield" />
          <h2>Change password</h2>
          <p>Changing your password signs out all current sessions.</p>
        </div>
        <form (ngSubmit)="changePassword()">
          <div class="form-grid">
            <label class="span-2"
              >Current password<input
                name="current_password"
                type="password"
                [(ngModel)]="currentPassword"
                autocomplete="current-password"
                required
                maxlength="1024" /></label
            ><label class="span-2"
              >New password<input
                name="new_password"
                type="password"
                [(ngModel)]="newPassword"
                autocomplete="new-password"
                required
                minlength="12"
                maxlength="1024"
              /><small>At least 12 characters.</small></label
            ><label class="span-2"
              >Confirm new password<input
                name="confirm_password"
                type="password"
                [(ngModel)]="confirmPassword"
                autocomplete="new-password"
                required
            /></label>
          </div>
          <button class="button subtle" [disabled]="passwordBusy()">
            Update password
          </button>
        </form>
      </section>
    }`,
})
export class SettingsPage implements OnInit {
  api = inject(Api);
  router = inject(Router);
  preferences: Preferences | null = null;
  infrastructure = signal<Settings["infrastructure"] | null>(null);
  busy = signal(false);
  passwordBusy = signal(false);
  message = signal("");
  currentPassword = "";
  newPassword = "";
  confirmPassword = "";
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      const settings = await this.api.request<Settings>("GET", "/settings");
      this.preferences = { ...settings.preferences };
      this.infrastructure.set(settings.infrastructure);
    } catch (e) {
      this.api.error.set(this.api.message(e));
    }
  }
  async save() {
    this.busy.set(true);
    this.message.set("");
    try {
      const settings = await this.api.request<Settings>(
        "PUT",
        "/settings",
        this.preferences,
      );
      this.api.settings.set(settings);
      this.message.set("Settings saved");
    } catch (e) {
      this.api.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
  async changePassword() {
    if (this.newPassword !== this.confirmPassword) {
      this.api.error.set("The new passwords do not match.");
      return;
    }
    this.passwordBusy.set(true);
    try {
      await this.api.request("POST", "/auth/change-password", {
        current_password: this.currentPassword,
        new_password: this.newPassword,
      });
      this.currentPassword = "";
      this.newPassword = "";
      this.confirmPassword = "";
      this.api.stop();
      this.api.user.set(null);
      await this.router.navigateByUrl("/login");
    } catch (e) {
      this.api.error.set(this.api.message(e));
    } finally {
      this.passwordBusy.set(false);
    }
  }
}
