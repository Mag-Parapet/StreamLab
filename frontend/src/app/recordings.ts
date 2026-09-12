import { Component, inject, signal, OnInit } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { Api } from "./api";
import { StreamSession } from "./models";
import { Icon } from "./icon";
import { duration } from "./format";
@Component({
  standalone: true,
  imports: [DatePipe, DecimalPipe, Icon],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">WORKSPACE / ARCHIVE</div>
        <h1>Recordings<span class="heading-dot"></span></h1>
        <p>Your stream history and access to server files.</p>
      </div>
    </div>
    <section class="panel recording-empty">
      <span class="node-icon"><app-icon name="recordings" /></span>
      <div>
        <h2>Recording is not enabled</h2>
        <p>
          This deployment relays your stream without saving video. Open File
          Browser to access existing media on your server.
        </p>
      </div>
      <a
        class="button subtle"
        [href]="api.settings()?.preferences?.file_browser_url"
        target="_blank"
        rel="noopener noreferrer"
        >Open File Browser<app-icon name="external"
      /></a>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <h2>Stream session history</h2>
        <button class="button subtle" (click)="load()">
          <app-icon name="refresh" />Refresh
        </button>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Duration</th>
              <th>Resolution</th>
              <th>Last bitrate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (s of sessions(); track s.id) {
              <tr>
                <td>{{ s.start_time | date: "MMM d, y HH:mm" }}</td>
                <td class="mono">{{ duration(s.duration) }}</td>
                <td>{{ s.resolution || "—" }}</td>
                <td>
                  {{
                    s.input_bitrate == null
                      ? "—"
                      : (s.input_bitrate | number: "1.1-1") + " Mbps"
                  }}
                </td>
                <td>
                  <span class="badge" [class.green]="s.status === 'live'">{{
                    s.status
                  }}</span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty-table">
                  No stream sessions yet. Connect OBS to create your first
                  session.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>`,
})
export class RecordingsPage implements OnInit {
  api = inject(Api);
  sessions = signal<StreamSession[]>([]);
  duration = duration;
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      this.sessions.set(
        await this.api.request<StreamSession[]>("GET", "/stream/sessions"),
      );
    } catch (e) {
      this.api.error.set(this.api.message(e));
    }
  }
}
