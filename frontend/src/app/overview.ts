import { Component, inject, signal, computed } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { Api } from "./api";
import { Icon } from "./icon";
import { duration, bytes, percent } from "./format";
@Component({
  standalone: true,
  imports: [RouterLink, Icon, DatePipe, DecimalPipe],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">
          WORKSPACE / {{ isLive ? "LIVE CONTROL" : "OVERVIEW" }}
        </div>
        <h1>
          {{ isLive ? "Live control" : "Dashboard"
          }}<span class="heading-dot"></span>
        </h1>
        <p>
          {{
            isLive
              ? "Your incoming signal and outgoing broadcasts, in one place."
              : "Your streaming infrastructure, at a glance."
          }}
        </p>
      </div>
      <div class="heading-actions">
        <span class="date-label">{{ today | date: "EEE, MMM d" }}</span
        ><a routerLink="/settings" class="button subtle"
          ><app-icon name="settings" />Configure</a
        >
      </div>
    </div>
    @if (api.snapshot(); as data) {
      <div class="status-strip">
        <div>
          <span
            class="tiny-dot"
            [class.healthy]="data.stream.engine_online"
          ></span
          ><strong>{{
            data.stream.engine_online
              ? "Media engine connected"
              : "Media engine unavailable"
          }}</strong
          ><span class="muted">{{
            data.stream.obs_connected
              ? " · Incoming signal detected"
              : " · Waiting for an incoming stream"
          }}</span>
        </div>
        <span class="mono"
          >Updated {{ data.timestamp | date: "HH:mm:ss" }}</span
        >
      </div>
      <section class="metric-grid">
        <article class="metric">
          <div class="metric-label">
            STREAM STATUS<app-icon name="activity" />
          </div>
          <div class="metric-value status-value">
            <span
              class="tiny-dot"
              [class.healthy]="data.stream.obs_connected"
            ></span
            >{{
              data.stream.engine_online
                ? forwarding() > 0
                  ? "Live"
                  : data.stream.obs_connected
                    ? "Receiving"
                    : "Standby"
                : "Unknown"
            }}
          </div>
          <div class="metric-foot">
            {{
              data.stream.obs_connected
                ? "OBS is publishing to your server"
                : "Connect OBS to begin streaming"
            }}
          </div>
        </article>
        <article class="metric">
          <div class="metric-label">STREAM UPTIME<app-icon name="clock" /></div>
          <div class="metric-value mono">
            {{
              duration(
                data.stream.obs_connected ? data.stream.uptime_seconds : null
              )
            }}
          </div>
          <div class="metric-foot">
            {{
              data.stream.obs_connected
                ? "Current publishing session"
                : "No active session"
            }}
          </div>
        </article>
        <article class="metric">
          <div class="metric-label">
            INPUT BITRATE<app-icon name="upload" />
          </div>
          <div class="metric-value">
            {{
              data.stream.bitrate_mbps == null
                ? "—"
                : (data.stream.bitrate_mbps | number: "1.1-1")
            }}
            <small>Mbps</small>
          </div>
          <div class="metric-foot">
            {{ data.stream.resolution || "Resolution unavailable" }}
            <span class="separator">·</span>
            {{
              data.stream.fps == null
                ? "FPS unavailable"
                : data.stream.fps + " FPS"
            }}
          </div>
        </article>
        <article class="metric">
          <div class="metric-label">
            DESTINATIONS<app-icon name="destinations" />
          </div>
          <div class="metric-value">
            {{ forwarding()
            }}<small> / {{ data.stream.destinations.length }}</small>
          </div>
          <div class="metric-foot">
            <span class="tiny-dot" [class.healthy]="forwarding() > 0"></span
            >{{
              forwarding() > 0 ? "Actively forwarding" : "No active forwards"
            }}
          </div>
        </article>
      </section>
      <div class="overview-grid">
        <section class="panel stream-panel">
          <div class="panel-heading">
            <h2><app-icon name="signal" />Signal overview</h2>
            <span class="badge" [class.green]="data.stream.obs_connected">{{
              data.stream.obs_connected ? "INPUT CONNECTED" : "AWAITING SIGNAL"
            }}</span>
          </div>
          <div class="signal-flow">
            <div class="flow-node">
              <div class="node-icon obs-icon">◉</div>
              <strong>OBS Studio</strong
              ><small>{{
                data.stream.obs_connected ? "Connected" : "Disconnected"
              }}</small>
            </div>
            <div class="flow-line" [class.on]="data.stream.obs_connected">
              <span>RTMP</span>
            </div>
            <div class="flow-node">
              <div class="node-icon media-icon"><app-icon name="signal" /></div>
              <strong>MediaMTX</strong
              ><small>{{
                data.stream.engine_online ? "Ready to relay" : "Unavailable"
              }}</small>
            </div>
            <div class="flow-line" [class.on]="forwarding() > 0">
              <span>RTMPS</span>
            </div>
            <div class="flow-node">
              <div class="node-icon"><app-icon name="destinations" /></div>
              <strong>Destinations</strong
              ><small>{{ forwarding() }} forwarding</small>
            </div>
          </div>
          <div class="stream-details">
            <div>
              <small>VIDEO CODEC</small
              ><strong>{{ data.stream.codec || "—" }}</strong>
            </div>
            <div>
              <small>RESOLUTION</small
              ><strong>{{ data.stream.resolution || "—" }}</strong>
            </div>
            <div>
              <small>FRAME RATE</small
              ><strong>{{
                data.stream.fps == null ? "—" : data.stream.fps + " FPS"
              }}</strong>
            </div>
            <div>
              <small>LOCAL READERS</small
              ><strong>{{ data.stream.viewers ?? "—" }}</strong>
            </div>
          </div>
          <div class="relay-toolbar">
            <span class="muted"
              ><app-icon name="shield" />{{
                data.stream.relay_enabled ? "Relay enabled" : "Relay is stopped"
              }}</span
            >
            <div>
              <button
                class="button subtle"
                [disabled]="
                  busy() ||
                  !data.stream.engine_online ||
                  !data.stream.relay_enabled
                "
                (click)="control('restart')"
                aria-label="Restart relay"
              >
                <app-icon name="refresh" /></button
              ><button
                [class]="
                  data.stream.relay_enabled ? 'button danger' : 'button primary'
                "
                [disabled]="busy() || !data.stream.engine_online"
                (click)="control(data.stream.relay_enabled ? 'stop' : 'start')"
              >
                <app-icon
                  [name]="data.stream.relay_enabled ? 'stop' : 'live'"
                />{{
                  busy()
                    ? "Applying…"
                    : data.stream.relay_enabled
                      ? "Stop relay"
                      : "Start relay"
                }}
              </button>
            </div>
          </div>
          @if (feedback()) {
            <div class="inline-feedback" role="status">{{ feedback() }}</div>
          }
        </section>
        <section class="panel destinations-panel">
          <div class="panel-heading">
            <h2>Destinations</h2>
            <a routerLink="/destinations" class="text-link"
              >Manage<app-icon name="arrow"
            /></a>
          </div>
          <div class="destination-list">
            @for (d of data.stream.destinations; track d.id) {
              <a routerLink="/destinations" class="destination-row"
                ><div [class]="'platform-icon ' + d.kind">
                  {{
                    d.kind === "youtube"
                      ? "▶"
                      : d.kind === "facebook"
                        ? "f"
                        : "↗"
                  }}
                </div>
                <div class="destination-info">
                  <strong>{{ d.name }}</strong
                  ><small>{{
                    d.key_configured
                      ? d.enabled
                        ? "Enabled · RTMPS / RTMP"
                        : "Configured · Disabled"
                      : "Stream key needed"
                  }}</small>
                </div>
                <span
                  class="badge"
                  [class.green]="d.status === 'forwarding'"
                  [class.red]="d.status === 'error'"
                  >{{ d.status }}</span
                ></a
              >
            } @empty {
              <div class="empty-small">
                Add a destination to start relaying.
              </div>
            }
          </div>
          <div class="panel-note">
            <app-icon name="shield" />Stream keys are encrypted and never
            displayed.
          </div>
        </section>
        <section class="panel chart-panel">
          <div class="panel-heading">
            <div>
              <h2>Input bitrate</h2>
              <p class="muted">Live throughput over the last two minutes</p>
            </div>
            <span class="chart-legend"
              ><span class="tiny-dot healthy"></span>Input
              <strong
                >{{
                  data.stream.bitrate_mbps == null
                    ? "—"
                    : (data.stream.bitrate_mbps | number: "1.1-1")
                }}
                Mbps</strong
              ></span
            >
          </div>
          <div class="chart-wrap">
            <div class="chart-scale">
              <span>{{ chartMax() | number: "1.0-1" }}</span
              ><span>{{ chartMax() / 2 | number: "1.0-1" }}</span
              ><span>0 Mbps</span>
            </div>
            <div class="chart-surface">
              <svg
                viewBox="0 0 600 150"
                preserveAspectRatio="none"
                aria-label="Input bitrate history"
              >
                <defs>
                  <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#62dbae" stop-opacity=".22" />
                    <stop offset="100%" stop-color="#62dbae" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 1H600 M0 75H600 M0 149H600"
                  stroke="#293132"
                  stroke-dasharray="3 5"
                />
                <path [attr.d]="area()" fill="url(#chartFill)" />
                <path
                  [attr.d]="line()"
                  fill="none"
                  stroke="#62dbae"
                  stroke-width="2"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              @if (!hasSamples()) {
                <div class="chart-empty">Waiting for bitrate samples</div>
              }
              <div class="chart-times">
                <span>2 min ago</span><span>1 min ago</span><span>Now</span>
              </div>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-heading">
            <h2>Server resources</h2>
            <a
              routerLink="/server"
              class="text-link"
              aria-label="View server resources"
              ><app-icon name="arrow"
            /></a>
          </div>
          <div class="resource-list">
            <div class="resource">
              <div>
                <span>CPU usage</span
                ><strong>{{
                  data.server.cpu_percent == null
                    ? "—"
                    : (data.server.cpu_percent | number: "1.0-1") + "%"
                }}</strong>
              </div>
              <div class="meter">
                <i [style.width.%]="data.server.cpu_percent || 0"></i>
              </div>
            </div>
            <div class="resource">
              <div>
                <span>Memory</span
                ><strong
                  >{{ bytes(data.server.ram_used_bytes)
                  }}<small>
                    / {{ bytes(data.server.ram_total_bytes) }}</small
                  ></strong
                >
              </div>
              <div class="meter blue">
                <i
                  [style.width.%]="
                    percent(
                      data.server.ram_used_bytes,
                      data.server.ram_total_bytes
                    )
                  "
                ></i>
              </div>
            </div>
            <div class="resource">
              <div>
                <span>Storage · /data</span
                ><strong
                  >{{ bytes(data.storage.data.used_bytes)
                  }}<small>
                    / {{ bytes(data.storage.data.total_bytes) }}</small
                  ></strong
                >
              </div>
              <div class="meter purple">
                <i
                  [style.width.%]="
                    percent(
                      data.storage.data.used_bytes,
                      data.storage.data.total_bytes
                    )
                  "
                ></i>
              </div>
            </div>
            <div class="network-summary">
              <span
                ><app-icon name="upload" />{{
                  data.server.upload_mbps == null
                    ? "—"
                    : (data.server.upload_mbps | number: "1.1-1")
                }}<small>Mbps up</small></span
              ><span
                ><app-icon name="download" />{{
                  data.server.download_mbps == null
                    ? "—"
                    : (data.server.download_mbps | number: "1.1-1")
                }}<small>Mbps down</small></span
              >
            </div>
          </div>
        </section>
        <section class="panel activity-panel">
          <div class="panel-heading">
            <h2>Recent activity</h2>
            <a routerLink="/logs" class="text-link"
              >View logs<app-icon name="arrow"
            /></a>
          </div>
          @for (event of api.logs().slice(0, 4); track event.id) {
            <div class="activity-row">
              <span
                class="event-mark"
                [class.warning]="
                  event.level === 'warning' || event.level === 'error'
                "
                ><app-icon
                  [name]="event.level === 'info' ? 'check' : 'warning'"
              /></span>
              <div>
                <strong>{{ event.message }}</strong
                ><small>{{ event.source }}</small>
              </div>
              <time>{{ event.timestamp | date: "HH:mm:ss" }}</time>
            </div>
          } @empty {
            <div class="empty-small">
              Activity will appear here as your server reports events.
            </div>
          }
        </section>
        <section class="panel files-panel">
          <span class="file-icon"><app-icon name="folder" /></span>
          <h2>Your files, one click away.</h2>
          <p>
            Browse and manage your server files with your existing File Browser.
          </p>
          <a
            class="button subtle"
            [href]="api.settings()?.preferences?.file_browser_url"
            target="_blank"
            rel="noopener noreferrer"
            >Open File Browser<app-icon name="external"
          /></a>
        </section>
      </div>
    } @else {
      <section class="panel loading-state">
        <app-icon name="refresh" />
        <h2>Connecting to your infrastructure</h2>
        <p>Waiting for the first status update from the server.</p>
      </section>
    }`,
})
export class Overview {
  api = inject(Api);
  router = inject(Router);
  isLive = this.router.url === "/live";
  today = new Date();
  duration = duration;
  bytes = bytes;
  percent = percent;
  busy = signal(false);
  feedback = signal("");
  forwarding = computed(
    () =>
      this.api
        .snapshot()
        ?.stream.destinations.filter((d) => d.status === "forwarding").length ??
      0,
  );
  chartMax = computed(
    () =>
      Math.max(
        10,
        ...this.api.history().filter((v): v is number => v !== null),
      ) * 1.1,
  );
  hasSamples = computed(() => this.api.history().some((v) => v !== null));
  line = computed(() => {
    const h = this.api.history();
    let pen = false;
    return h
      .map((v, i) => {
        if (v == null) {
          pen = false;
          return "";
        }
        const cmd = pen ? "L" : "M";
        pen = true;
        return `${cmd}${(i * 600) / 59},${149 - (v / this.chartMax()) * 140}`;
      })
      .join(" ");
  });
  area = computed(() => {
    const h = this.api.history();
    if (h.length < 2 || h.some((v) => v == null)) return "";
    return this.line() + ` L${((h.length - 1) * 600) / 59},150 L0,150 Z`;
  });
  async control(action: string) {
    this.busy.set(true);
    this.feedback.set("");
    try {
      await this.api.request("POST", `/stream/${action}`, {});
      this.feedback.set(
        action === "stop"
          ? "Relay stopped. OBS can continue publishing."
          : "Relay configuration applied. Waiting for MediaMTX status.",
      );
    } catch (e) {
      this.api.error.set(this.api.message(e));
    } finally {
      this.busy.set(false);
    }
  }
}
