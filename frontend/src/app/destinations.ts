import { DialogFocus } from "./dialog";
import { Component, inject, signal, OnInit, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Api } from "./api";
import { Destination } from "./models";
import { Icon } from "./icon";
type Draft = {
  name: string;
  kind: string;
  enabled: boolean;
  url: string;
  stream_key: string;
  title: string;
  description: string;
  clear_key: boolean;
};
@Component({
  standalone: true,
  imports: [FormsModule, Icon, DialogFocus],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">WORKSPACE / OUTPUTS</div>
        <h1>Destinations<span class="heading-dot"></span></h1>
        <p>One incoming signal. Reach every audience.</p>
      </div>
      <button class="button primary" (click)="open()" [disabled]="relay()">
        <app-icon name="plus" />Add destination
      </button>
    </div>
    @if (relay()) {
      <div class="notice warning">
        Stop the relay on the Live page before changing destination
        configuration.
      </div>
    }
    <div class="destination-cards">
      @for (d of items(); track d.id) {
        <article class="panel destination-card">
          <div class="destination-card-top">
            <span [class]="'platform-icon large ' + d.kind">{{
              d.kind === "youtube" ? "▶" : d.kind === "facebook" ? "f" : "↗"
            }}</span
            ><span
              class="badge"
              [class.green]="status(d) === 'forwarding'"
              [class.red]="status(d) === 'error'"
              >{{ status(d) }}</span
            >
          </div>
          <h2>{{ d.name }}</h2>
          <p>{{ d.title || "No stream title configured" }}</p>
          <div class="destination-fields">
            <div>
              <span>Stream key</span
              ><strong [class.text-green]="d.key_configured">{{
                d.key_configured ? "Configured securely" : "Not configured"
              }}</strong>
            </div>
            <div>
              <span>Relay destination</span
              ><strong>{{ d.enabled ? "Enabled" : "Disabled" }}</strong>
            </div>
            <div>
              <span>Server</span><strong class="url-text">{{ d.url }}</strong>
            </div>
          </div>
          <div class="card-actions">
            <button
              class="button subtle"
              (click)="open(d)"
              [disabled]="relay()"
            >
              <app-icon name="edit" />Configure</button
            ><button
              class="button subtle"
              (click)="toggle(d)"
              [disabled]="busy() || relay() || !d.key_configured"
            >
              {{ d.enabled ? "Disable" : "Enable" }}</button
            ><button
              class="icon-button"
              (click)="deleting.set(d)"
              [disabled]="relay()"
              [attr.aria-label]="'Delete ' + d.name"
            >
              <app-icon name="trash" />
            </button>
          </div>
        </article>
      } @empty {
        <div class="panel empty-state">
          <app-icon name="destinations" />
          <h2>No destinations yet</h2>
          <p>Add YouTube, Facebook, or a custom RTMP endpoint.</p>
        </div>
      }
    </div>
    <div class="notice info">
      <app-icon name="shield" /><span
        >Titles and descriptions are saved locally. Set broadcast metadata and
        publish visibility in YouTube Studio or Facebook Live Producer.
        Forwarding confirms media transport, not platform audience
        visibility.</span
      >
    </div>
    @if (editing()) {
      <div class="modal-backdrop">
        <section
          class="modal"
          appDialog
          (dismiss)="close()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="destination-title"
        >
          <div class="panel-heading">
            <h2 id="destination-title">
              {{ editingId ? "Configure destination" : "Add destination" }}
            </h2>
            <button class="icon-button" (click)="close()" aria-label="Close">
              <app-icon name="close" />
            </button>
          </div>
          <form (ngSubmit)="save()">
            <div class="form-grid">
              <label
                >Display name<input
                  name="name"
                  [(ngModel)]="draft.name"
                  required
                  maxlength="100" /></label
              ><label
                >Platform<select
                  name="kind"
                  [(ngModel)]="draft.kind"
                  (ngModelChange)="platformChanged()"
                >
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="custom">Custom RTMP</option>
                </select></label
              ><label class="span-2"
                >RTMP(S) server URL<input
                  name="url"
                  [(ngModel)]="draft.url"
                  required
                  placeholder="rtmps://server.example/live"
                  maxlength="1000"
                /><small
                  >Enter the server address only. Keep the key in the secure
                  field below.</small
                ></label
              ><label class="span-2"
                >{{ editingId ? "Replace stream key" : "Stream key"
                }}<input
                  name="stream_key"
                  type="password"
                  [(ngModel)]="draft.stream_key"
                  autocomplete="new-password"
                  maxlength="2048"
                  placeholder="Enter a stream key securely"
                /><small>{{
                  editingId
                    ? "Leave blank to keep the current key."
                    : "Your key is encrypted before it is stored."
                }}</small></label
              ><label class="span-2"
                >Stream title<input
                  name="title"
                  [(ngModel)]="draft.title"
                  maxlength="200" /></label
              ><label class="span-2"
                >Description<textarea
                  name="description"
                  [(ngModel)]="draft.description"
                  maxlength="5000"
                  rows="3"
                ></textarea></label
              ><label class="checkbox-label"
                ><input
                  name="enabled"
                  type="checkbox"
                  [(ngModel)]="draft.enabled"
                />Enable destination</label
              >
              @if (editingId) {
                <label class="checkbox-label"
                  ><input
                    name="clear"
                    type="checkbox"
                    [(ngModel)]="draft.clear_key"
                  />Remove saved key</label
                >
              }
            </div>
            @if (formError()) {
              <div class="notice error" role="alert">{{ formError() }}</div>
            }
            <div class="modal-actions">
              <button class="button subtle" type="button" (click)="close()">
                Cancel</button
              ><button class="button primary" [disabled]="busy()">
                {{ busy() ? "Saving…" : "Save destination" }}
              </button>
            </div>
          </form>
        </section>
      </div>
    }
    @if (deleting(); as d) {
      <div class="modal-backdrop">
        <section
          class="modal small"
          appDialog
          (dismiss)="deleting.set(null)"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <h2 id="delete-title">Remove {{ d.name }}?</h2>
          <p>This removes its configuration and saved stream key.</p>
          <div class="modal-actions">
            <button class="button subtle" (click)="deleting.set(null)">
              Cancel</button
            ><button
              class="button danger"
              [disabled]="busy()"
              (click)="remove(d)"
            >
              Remove destination
            </button>
          </div>
        </section>
      </div>
    }`,
})
export class DestinationsPage implements OnInit {
  api = inject(Api);
  items = signal<Destination[]>([]);
  editing = signal(false);
  deleting = signal<Destination | null>(null);
  busy = signal(false);
  formError = signal("");
  editingId: string | null = null;
  relay = computed(() => this.api.snapshot()?.stream.relay_enabled ?? false);
  draft: Draft = this.blank();
  blank(): Draft {
    return {
      name: "",
      kind: "youtube",
      enabled: false,
      url: "rtmps://a.rtmp.youtube.com/live2",
      stream_key: "",
      title: "",
      description: "",
      clear_key: false,
    };
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      this.items.set(
        await this.api.request<Destination[]>("GET", "/destinations"),
      );
    } catch (e) {
      this.api.error.set(this.api.message(e));
    }
  }
  status(d: Destination) {
    return (
      this.api.snapshot()?.stream.destinations.find((v) => v.id === d.id)
        ?.status ?? d.status
    );
  }
  open(d?: Destination) {
    this.editingId = d?.id ?? null;
    this.draft = d
      ? {
          name: d.name,
          kind: d.kind,
          enabled: d.enabled,
          url: d.url,
          title: d.title,
          description: d.description,
          stream_key: "",
          clear_key: false,
        }
      : this.blank();
    this.formError.set("");
    this.editing.set(true);
  }
  close() {
    this.editing.set(false);
    this.draft.stream_key = "";
  }
  platformChanged() {
    this.draft.url =
      this.draft.kind === "youtube"
        ? "rtmps://a.rtmp.youtube.com/live2"
        : this.draft.kind === "facebook"
          ? "rtmps://live-api-s.facebook.com:443/rtmp"
          : "";
  }
  async save() {
    this.busy.set(true);
    this.formError.set("");
    try {
      await this.api.request(
        this.editingId ? "PUT" : "POST",
        this.editingId ? `/destinations/${this.editingId}` : "/destinations",
        this.draft,
      );
      this.close();
      await this.load();
    } catch (e) {
      this.formError.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
  async toggle(d: Destination) {
    this.busy.set(true);
    try {
      await this.api.request("PUT", `/destinations/${d.id}`, {
        name: d.name,
        kind: d.kind,
        url: d.url,
        title: d.title,
        description: d.description,
        enabled: !d.enabled,
      });
      await this.load();
    } catch (e) {
      this.api.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
  async remove(d: Destination) {
    this.busy.set(true);
    try {
      await this.api.request("DELETE", `/destinations/${d.id}`);
      this.deleting.set(null);
      await this.load();
    } catch (e) {
      this.api.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
