import { Component, input } from "@angular/core";
@Component({
  selector: "app-icon",
  standalone: true,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="paths[name()] || paths['grid']" />
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class Icon {
  name = input("grid");
  paths: Record<string, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    live: "M8 5l11 7-11 7z",
    destinations: "M4 12h7 M11 12V5h8 M11 12v7h8 M16 2l3 3-3 3 M16 16l3 3-3 3",
    recordings: "M4 4h16v16H4z M4 9h16 M9 9v11",
    storage: "M4 3h16v7H4z M4 14h16v7H4z M7 6h.01 M7 17h.01 M15 6h2 M15 17h2",
    server: "M5 3h14v18H5z M8 7h8 M8 11h8 M8 16h.01 M12 16h.01",
    logs: "M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M10 3h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3z",
    arrow: "M5 12h14 M14 7l5 5-5 5",
    external: "M14 3h7v7 M21 3L10 14 M10 3H3v18h18v-7",
    refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 1 M18 18a8 8 0 0 1-13-1",
    stop: "M6 6h12v12H6z",
    plus: "M12 5v14 M5 12h14",
    check: "M5 12l4 4L19 6",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
    activity: "M2 12h5l3-8 4 16 3-8h5",
    upload: "M12 19V5 M6 11l6-6 6 6",
    download: "M12 5v14 M6 13l6 6 6-6",
    shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 11l3 3 5-5",
    folder: "M3 6h7l2 2h9v12H3z",
    logout: "M9 4H3v16h6 M9 12h12 M17 8l4 4-4 4",
    menu: "M3 6h18 M3 12h18 M3 18h18",
    close: "M6 6l12 12 M18 6L6 18",
    signal: "M4 17v3 M9 12v8 M14 7v13 M19 3v17",
    warning: "M12 3l10 18H2z M12 9v5 M12 17h.01",
    edit: "M4 16l12-12 4 4L8 20H4z M14 6l4 4",
    trash: "M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  };
}
