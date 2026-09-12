import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { Api } from "./api";
import { Icon } from "./icon";
@Component({
  standalone: true,
  imports: [FormsModule, Icon],
  template: `<main class="login-layout">
    <section class="login-story">
      <div class="brand">
        <span class="brand-mark"><app-icon name="signal" /></span>signal<span
          class="brand-dot"
          >.</span
        >
      </div>
      <div>
        <span class="eyebrow">YOUR BROADCAST. YOUR INFRASTRUCTURE.</span>
        <h1>One signal.<br />Every destination.</h1>
        <p>
          A clear view of your streams, your server, and everything in between.
        </p>
        <div class="login-flow">
          <span>OBS</span><i></i><span class="active">MediaMTX</span><i></i
          ><span>Your audience</span>
        </div>
      </div>
      <small>STREAMING CONTROL CENTER · SELF-HOSTED</small>
    </section>
    <section class="login-form">
      <div class="login-box">
        <span class="eyebrow">CONTROL STARTS HERE</span>
        <h2>Welcome back</h2>
        <p class="muted">Sign in to your streaming control center.</p>
        <form (ngSubmit)="submit()">
          <label
            >Username<input
              name="username"
              [(ngModel)]="username"
              autocomplete="username"
              required
              maxlength="100"
              autofocus /></label
          ><label
            >Password<input
              name="password"
              type="password"
              [(ngModel)]="password"
              autocomplete="current-password"
              required
              maxlength="1024"
          /></label>
          @if (error()) {
            <div class="notice error" role="alert">{{ error() }}</div>
          }
          <button
            class="button primary full"
            [disabled]="busy() || !username || !password"
          >
            {{ busy() ? "Signing in…" : "Sign in" }}<app-icon name="arrow" />
          </button>
        </form>
        <div class="secure-note">
          <app-icon name="shield" /> Protected access to your infrastructure
        </div>
      </div>
    </section>
  </main>`,
})
export class LoginPage {
  api = inject(Api);
  router = inject(Router);
  username = "";
  password = "";
  busy = signal(false);
  error = signal("");
  async submit() {
    this.busy.set(true);
    this.error.set("");
    try {
      await this.api.login(this.username, this.password);
      this.password = "";
      await this.router.navigateByUrl("/dashboard");
    } catch (e) {
      this.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
