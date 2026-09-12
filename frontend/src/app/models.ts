export interface Destination {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  url: string;
  key_configured: boolean;
  title: string;
  description: string;
  status: string;
}
export interface Stream {
  engine_online: boolean;
  obs_connected: boolean;
  started_at: string | null;
  uptime_seconds: number;
  bitrate_mbps: number | null;
  resolution: string | null;
  fps: number | null;
  codec: string | null;
  viewers: number | null;
  relay_enabled: boolean;
  destinations: Destination[];
}
export interface Disk {
  mount: string;
  filesystem: string | null;
  total_bytes: number | null;
  used_bytes: number | null;
  free_bytes: number | null;
}
export interface Storage {
  raid_status: string;
  disk_count: number | null;
  raid_level: string | null;
  sync_progress: string | null;
  data: Disk;
  root: Disk;
}
export interface Server {
  available: boolean;
  cpu_percent: number | null;
  load_average: string | null;
  temperature_c: number | null;
  ram_used_bytes: number | null;
  ram_total_bytes: number | null;
  ram_available_bytes: number | null;
  upload_mbps: number | null;
  download_mbps: number | null;
  interfaces: { name: string; state: string }[];
  hostname: string | null;
  os: string | null;
  kernel: string | null;
  uptime_seconds: number | null;
}
export interface Snapshot {
  timestamp: string | null;
  stream: Stream;
  server: Server;
  storage: Storage;
}
export interface Event {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  message: string;
}
export interface Preferences {
  server_name: string;
  input_protocol: string;
  input_port: number;
  default_bitrate: number;
  default_resolution: string;
  default_fps: number;
  file_browser_url: string;
  session_hours: number;
}
export interface Settings {
  preferences: Preferences;
  infrastructure: {
    mediamtx_api_url: string;
    mediamtx_rtsp_url: string;
    managed_by: string;
    api_auth: string;
    recordings_enabled: boolean;
  };
}
export interface StreamSession {
  id: string;
  start_time: string;
  end_time: string | null;
  duration: number | null;
  input_bitrate: number | null;
  resolution: string | null;
  fps: number | null;
  destinations: string[];
  status: string;
}
