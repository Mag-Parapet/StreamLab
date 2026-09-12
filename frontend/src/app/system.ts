import { Component, inject } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { Router } from "@angular/router";
import { Api } from "./api";
import { Icon } from "./icon";
import { bytes, duration, percent } from "./format";
@Component({
  standalone: true,
  imports: [DecimalPipe, Icon],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">WORKSPACE / INFRASTRUCTURE</div>
        <h1>
          {{ storage ? "Storage" : "Server" }}<span class="heading-dot"></span>
        </h1>
        <p>
          {{
            storage
              ? "A read-only view of your disks and RAID array."
              : "Understand the health of your streaming hardware."
          }}
        </p>
      </div>
      <span class="badge">READ-ONLY MONITORING</span>
    </div>
    @if (api.snapshot(); as d) {
      @if (storage) {
        <section class="panel raid-banner">
          <span class="node-icon"><app-icon name="storage" /></span>
          <div>
            <span class="eyebrow">/dev/md0</span>
            <h2>Data array</h2>
            <p>
              {{ d.storage.raid_level || "RAID level unavailable" }} ·
              {{ d.storage.disk_count ?? "—" }} disks · /data
            </p>
          </div>
          <span
            class="badge"
            [class.green]="d.storage.raid_status === 'healthy'"
            [class.red]="d.storage.raid_status === 'failed'"
            [class.yellow]="
              d.storage.raid_status === 'degraded' ||
              d.storage.raid_status === 'rebuilding'
            "
            >{{ d.storage.raid_status }}</span
          >
        </section>
        <div class="system-grid">
          @for (disk of [d.storage.data, d.storage.root]; track disk.mount) {
            <section class="panel system-card">
              <h2>
                {{
                  disk.mount === "/" ? "System filesystem" : "Data filesystem"
                }}
              </h2>
              <div class="big-stat">
                {{ bytes(disk.used_bytes) }}<small>used</small>
              </div>
              <div class="meter purple">
                <i
                  [style.width.%]="percent(disk.used_bytes, disk.total_bytes)"
                ></i>
              </div>
              <dl>
                <div>
                  <dt>Mount</dt>
                  <dd class="mono">{{ disk.mount }}</dd>
                </div>
                <div>
                  <dt>Filesystem</dt>
                  <dd>{{ disk.filesystem || "Unavailable" }}</dd>
                </div>
                <div>
                  <dt>Total capacity</dt>
                  <dd>{{ bytes(disk.total_bytes) }}</dd>
                </div>
                <div>
                  <dt>Available space</dt>
                  <dd>{{ bytes(disk.free_bytes) }}</dd>
                </div>
              </dl>
            </section>
          }
        </div>
        <div class="panel system-card">
          <h2>Array operations</h2>
          <p>
            Disk modifications are disabled. Manage RAID maintenance directly on
            your server.
          </p>
          <button class="button subtle" disabled>
            Disk operations disabled
          </button>
          @if (d.storage.raid_status === "rebuilding") {
            <p>
              Rebuild progress: {{ d.storage.sync_progress || "Unavailable" }}
            </p>
          }
        </div>
      } @else {
        @if (!d.server.available) {
          <div class="notice warning">
            Host monitoring is unavailable. On Ubuntu, verify the read-only
            /proc, /sys, root and /data mounts in Docker Compose.
          </div>
        }
        <div class="system-grid">
          <section class="panel system-card">
            <h2><app-icon name="activity" />Processor</h2>
            <div class="big-stat">
              {{
                d.server.cpu_percent == null
                  ? "—"
                  : (d.server.cpu_percent | number: "1.1-1")
              }}<small>% usage</small>
            </div>
            <div class="meter">
              <i [style.width.%]="d.server.cpu_percent || 0"></i>
            </div>
            <dl>
              <div>
                <dt>Load · 1 / 5 / 15 min</dt>
                <dd>{{ d.server.load_average || "—" }}</dd>
              </div>
              <div>
                <dt>CPU temperature</dt>
                <dd>
                  {{
                    d.server.temperature_c == null
                      ? "Unavailable"
                      : d.server.temperature_c + " °C"
                  }}
                </dd>
              </div>
            </dl>
          </section>
          <section class="panel system-card">
            <h2><app-icon name="server" />Memory</h2>
            <div class="big-stat">
              {{ bytes(d.server.ram_used_bytes) }}<small>used</small>
            </div>
            <div class="meter blue">
              <i
                [style.width.%]="
                  percent(d.server.ram_used_bytes, d.server.ram_total_bytes)
                "
              ></i>
            </div>
            <dl>
              <div>
                <dt>Total memory</dt>
                <dd>{{ bytes(d.server.ram_total_bytes) }}</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{{ bytes(d.server.ram_available_bytes) }}</dd>
              </div>
            </dl>
          </section>
          <section class="panel system-card">
            <h2><app-icon name="signal" />Network</h2>
            <div class="network-large">
              <div>
                <small>UPLOAD</small
                ><strong
                  >{{
                    d.server.upload_mbps == null
                      ? "—"
                      : (d.server.upload_mbps | number: "1.1-1")
                  }}<small>Mbps</small></strong
                >
              </div>
              <div>
                <small>DOWNLOAD</small
                ><strong
                  >{{
                    d.server.download_mbps == null
                      ? "—"
                      : (d.server.download_mbps | number: "1.1-1")
                  }}<small>Mbps</small></strong
                >
              </div>
            </div>
            <dl>
              @for (n of d.server.interfaces; track n.name) {
                <div>
                  <dt>{{ n.name }}</dt>
                  <dd [class.text-green]="n.state === 'up'">{{ n.state }}</dd>
                </div>
              } @empty {
                <div>
                  <dt>Interfaces</dt>
                  <dd>Unavailable</dd>
                </div>
              }
            </dl>
          </section>
          <section class="panel system-card">
            <h2><app-icon name="settings" />System information</h2>
            <dl>
              <div>
                <dt>Hostname</dt>
                <dd>{{ d.server.hostname || "—" }}</dd>
              </div>
              <div>
                <dt>Operating system</dt>
                <dd>{{ d.server.os || "—" }}</dd>
              </div>
              <div>
                <dt>Kernel</dt>
                <dd>{{ d.server.kernel || "—" }}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd class="mono">{{ duration(d.server.uptime_seconds) }}</dd>
              </div>
              <div>
                <dt>MediaMTX</dt>
                <dd [class.text-green]="d.stream.engine_online">
                  {{ d.stream.engine_online ? "Online" : "Unavailable" }}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      }
    }`,
})
export class SystemPage {
  api = inject(Api);
  storage = inject(Router).url === "/storage";
  bytes = bytes;
  duration = duration;
  percent = percent;
}
