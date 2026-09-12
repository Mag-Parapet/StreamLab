import { Injectable, inject, signal } from "@angular/core";
import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
} from "@angular/common/http";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { Snapshot, Event, Settings } from "./models";
export const requestProtection: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { "X-Requested-With": "stream-control" } }));
@Injectable({ providedIn: "root" })
export class Api {
  private http = inject(HttpClient);
  private router = inject(Router);
  user = signal<string | null>(null);
  snapshot = signal<Snapshot | null>(null);
  settings = signal<Settings | null>(null);
  logs = signal<Event[]>([]);
  connection = signal<"connecting" | "connected" | "reconnecting" | "offline">(
    "offline",
  );
  history = signal<(number | null)[]>([]);
  error = signal("");
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallback: ReturnType<typeof setInterval> | null = null;
  private disposed = true;
  private attempts = 0;
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return (
        await firstValueFrom(
          this.http.request<{ data: T }>(method, `/api${path}`, { body }),
        )
      ).data;
    } catch (e) {
      if (
        e instanceof HttpErrorResponse &&
        e.status === 401 &&
        !path.includes("/auth/login")
      ) {
        this.stop();
        this.user.set(null);
        void this.router.navigateByUrl("/login");
      }
      throw e;
    }
  }
  message(e: unknown): string {
    if (e instanceof HttpErrorResponse)
      return (
        e.error?.error?.message ??
        (e.status === 0
          ? "The server cannot be reached. Check your connection."
          : "The request failed. Please try again.")
      );
    return "Something went wrong. Please try again.";
  }
  async checkSession(): Promise<boolean> {
    try {
      const me = await this.request<{ username: string }>("GET", "/auth/me");
      this.user.set(me.username);
      return true;
    } catch {
      return false;
    }
  }
  async login(username: string, password: string) {
    const me = await this.request<{ username: string }>("POST", "/auth/login", {
      username,
      password,
    });
    this.user.set(me.username);
  }
  async logout() {
    try {
      await this.request("POST", "/auth/logout", {});
      this.stop();
      this.user.set(null);
      this.snapshot.set(null);
      this.history.set([]);
      this.logs.set([]);
      await this.router.navigateByUrl("/login");
    } catch (e) {
      this.error.set(this.message(e));
    }
  }
  async start() {
    if (!this.disposed) return;
    this.disposed = false;
    try {
      const [settings, logs, snapshot] = await Promise.all([
        this.request<Settings>("GET", "/settings"),
        this.request<Event[]>("GET", "/logs"),
        this.request<Snapshot>("GET", "/dashboard"),
      ]);
      this.settings.set(settings);
      this.logs.set(logs);
      this.accept(snapshot);
    } catch (e) {
      this.error.set(this.message(e));
    }
    if (this.disposed) return;
    this.connect();
    this.fallback = setInterval(() => {
      if (this.connection() !== "connected")
        void this.request<Snapshot>("GET", "/dashboard")
          .then((s) => this.accept(s))
          .catch(() => {});
    }, 15000);
  }
  private accept(snapshot: Snapshot) {
    this.snapshot.set(snapshot);
    this.history.update((h) => [...h.slice(-59), snapshot.stream.bitrate_mbps]);
  }
  private connect() {
    if (this.disposed) return;
    this.connection.set(this.attempts ? "reconnecting" : "connecting");
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`,
    );
    this.socket = socket;
    socket.onopen = () => {
      this.connection.set("connected");
      this.attempts = 0;
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "snapshot") this.accept(message.data as Snapshot);
        if (message.type === "log")
          this.logs.update((v) => [message.data as Event, ...v].slice(0, 200));
      } catch {
        this.error.set("A status update could not be read.");
      }
    };
    socket.onclose = () => {
      if (this.disposed) return;
      this.connection.set("reconnecting");
      this.reconnectTimer = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** this.attempts++),
      );
    };
    socket.onerror = () => socket.close();
  }
  stop() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.fallback) clearInterval(this.fallback);
    this.socket?.close();
    this.socket = null;
    this.connection.set("offline");
  }
}
