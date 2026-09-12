import { Component, inject, signal, computed } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Api } from "./api";
@Component({
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `<div class="page-heading">
      <div>
        <div class="eyebrow">WORKSPACE / EVENTS</div>
        <h1>Logs<span class="heading-dot"></span></h1>
        <p>Application events and MediaMTX state changes, as they happen.</p>
      </div>
      <span class="badge" [class.green]="api.connection() === 'connected'">{{
        api.connection() === "connected" ? "LIVE UPDATES" : "RECONNECTING"
      }}</span>
    </div>
    <section class="panel">
      <div class="log-toolbar">
        <div class="filter-tabs">
          @for (l of levels; track l) {
            <button [class.active]="level() === l" (click)="level.set(l)">
              {{ l }}
            </button>
          }
        </div>
        <label class="sr-only" for="log-source">Source</label
        ><select
          id="log-source"
          [ngModel]="source()"
          (ngModelChange)="source.set($event)"
        >
          <option value="all">All sources</option>
          <option value="application">Application</option>
          <option value="mediamtx">MediaMTX</option>
          <option value="destinations">Destinations</option>
        </select>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Level</th>
              <th>Source</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            @for (event of filtered(); track event.id) {
              <tr>
                <td class="mono nowrap">
                  {{ event.timestamp | date: "MMM d, HH:mm:ss" }}
                </td>
                <td>
                  <span
                    class="badge"
                    [class.yellow]="event.level === 'warning'"
                    [class.red]="event.level === 'error'"
                    >{{ event.level }}</span
                  >
                </td>
                <td class="muted">{{ event.source }}</td>
                <td>{{ event.message }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="empty-table">
                  No events match these filters.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        Showing {{ filtered().length }} of the latest
        {{ api.logs().length }} events · 30-day server retention
      </div>
    </section>
    <p class="footnote">
      MediaMTX events reflect API health and publisher transitions. Raw engine
      logs remain available through Docker; they are not copied into this
      dashboard.
    </p>`,
})
export class LogsPage {
  api = inject(Api);
  levels = ["All", "Info", "Warning", "Error", "Debug"];
  level = signal("All");
  source = signal("all");
  filtered = computed(() =>
    this.api
      .logs()
      .filter(
        (e) =>
          (this.level() === "All" || e.level === this.level().toLowerCase()) &&
          (this.source() === "all" || e.source === this.source()),
      ),
  );
}
