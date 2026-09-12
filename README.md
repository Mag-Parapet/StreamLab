# Signal — Streaming Control Center

A self-hosted Angular 20 + Rust/Axum control center for an Ubuntu streaming server. PostgreSQL stores users, encrypted destination credentials, preferences, stream sessions, and events. MediaMTX **1.21.0** receives OBS and performs native RTMP/RTMPS forwarding; neither the frontend nor backend transcodes video.

## Run on Ubuntu

For Romanian installation instructions, see [Instalare pe Ubuntu](INSTALL.ro.md). To generate a fresh private `.env` without overwriting an existing file, run `bash infrastructure/setup.sh --origin https://YOUR_REAL_DOMAIN` (or `--local` for a loopback HTTP evaluation). Then run `python3 infrastructure/preflight.py` on Ubuntu before starting Compose. These helpers do not install software, start services, or modify storage. The manual equivalent follows.

Requirements: Docker Engine with Compose v2, an existing `/data` mount, and an HTTPS reverse proxy for remote dashboard access. The default resource limits total less than 2 GB; leave room for Ubuntu, File Browser, buffers, and filesystem caching on the 8 GB server. Build images on another machine if compilation competes with a live stream.

1. Copy `.env.example` to `.env` and restrict its permissions:

   ```sh
   cp .env.example .env
   chmod 600 .env
   ```

2. Generate **separate** secrets with `openssl rand -hex 32` for `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, `MEDIAMTX_API_PASSWORD`, and `OBS_PASSWORD`. Generate `ENCRYPTION_KEY` with `openssl rand -base64 32`. Put these values in `.env`; do not leave them empty. Use hex passwords for PostgreSQL and MediaMTX to avoid URL/JSON interpolation issues.
3. Set `PUBLIC_ORIGIN` to the exact dashboard origin (scheme + host + optional port, **no trailing slash**). Set up your reverse proxy with HTTPS and WebSocket forwarding to `127.0.0.1:8088`. Keep `COOKIE_SECURE=true`. An example Caddy configuration is in `infrastructure/Caddyfile.example`.
4. Verify `/data` is already mounted: `findmnt /data`. Compose refuses to create a missing data directory. It never initializes or modifies a RAID array.
5. Start the stack:

   ```sh
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```

6. Open your configured dashboard URL and sign in using `ADMIN_USER` and `ADMIN_PASSWORD`. Change the password from Settings. The environment password seeds the account only on first boot; changing it later does not reset an existing account.

For a **local HTTP evaluation only**, set `PUBLIC_ORIGIN=http://localhost:8088` and `COOKIE_SECURE=false`. Use an SSH tunnel to access the loopback-bound port from another computer. For LAN HTTP evaluation, deliberately set `DASHBOARD_BIND` to your server's LAN IP and use that same IP in `PUBLIC_ORIGIN`; use HTTPS for ongoing operation.

Only dashboard and RTMP ingest ports are published. PostgreSQL, the Rust API, and MediaMTX administration stay on the private Compose network. Limit port 1935 to trusted OBS machines using your host/network firewall or a VPN. RTMP ingest is not encrypted; use a trusted network/VPN. RTMPS destinations use TLS validation.

## Connect OBS

In OBS Settings → Stream, choose **Custom**:

- Server: `rtmp://YOUR_SERVER_IP:1935`
- Stream key: `live?user=obs&pass=YOUR_OBS_PASSWORD`
- Use a hex `OBS_PASSWORD` as described above so query escaping is unnecessary.
- Start Streaming in OBS. The dashboard should report the incoming publisher within roughly two seconds.

Set OBS encoding to H.264 video and AAC audio compatible with both destination services. YouTube requires audio and video tracks. Reference bitrate/resolution/FPS settings in the dashboard do **not** reconfigure OBS or transcode the stream. MediaMTX forwards what OBS provides.

## YouTube, Facebook, and custom destinations

1. Create the broadcast in YouTube Studio or Facebook Live Producer and obtain the current server URL and stream key.
2. Open Destinations → Configure. Paste the server address and enter the key in its separate password field. Enable the destination and save.
3. Repeat for the second platform, then use Live → Start relay.
4. `forwarding` means MediaMTX confirms transport to the endpoint. Verify the broadcast's public/live state on the platform itself.

Stream titles and descriptions are local labels, not YouTube/Facebook API updates. OAuth, platform audience counts, scheduling, thumbnail updates, and platform publication control are not implemented. They require additional platform API credentials/permissions. Stream keys can also be seeded from the optional environment variables **when the destination table is initially empty**; subsequent edits belong in the dashboard.

For custom destinations, administrators can select RTMP(S) endpoints, including private network servers. This intentional capability is administrator-only. SRT/Twitch/Kick adapters can be added behind the existing traits later; unsupported protocols are rejected today.

MediaMTX 1.21 uses a fragment separator (`server#key`) for native RTMP forwarding; the backend builds this internally. Never paste a combined destination URL into the server field. An invalid TLS certificate causes an error; the app never disables TLS verification. Confirm any certificate or endpoint problem with the provider.

Stop the relay before editing/enabling/disabling destinations. Stopping relay leaves OBS ingest connected. Restart performs stop then start; if start fails, relay stays stopped. Configuration mutations are serialized. Relays stop on controller startup and graceful shutdown; after a backend crash, MediaMTX may keep forwarding until the controller restarts. Engine restarts during an active broadcast trigger a forwarding-configuration recovery attempt. Do not run multiple backend replicas: this version is a single-controller deployment.

## Pages and truthful status

| Page | Behavior |
|---|---|
| Dashboard / Live | Incoming publisher, session uptime, measured bitrate, video resolution and codec, local readers, destination state, relay controls, resource meters, bitrate graph |
| Destinations | YouTube, Facebook, custom RTMP(S); encrypted write-only credentials; local metadata; enable/disable and deletion |
| Server | Host CPU deltas, load averages, RAM, network deltas, interfaces, hostname, OS, kernel, uptime, temperature when readable |
| Storage | Read-only `/dev/md0` RAID status, disk count, sync progress, root and `/data` filesystem counters |
| Recordings | Honest disabled recording state, File Browser link, persisted stream session history |
| Logs | Curated application events, MediaMTX API/publisher transitions, destination transitions; severity/source filters; live updates |
| Settings | OBS reference preferences, File Browser link, workspace name, session duration, password change; deployment-managed addresses shown read-only |

Unavailable readings display `—` or `unavailable`; there are no simulated samples. MediaMTX does not expose FPS in this API, so FPS stays null. Reader counts are **local MediaMTX clients**, not YouTube/Facebook viewers. Session bitrate stores the most recent measured Mbps, not an average. Input session history is separate from platform broadcasts. A controller restart closes unfinished sessions as `interrupted`.

The backend samples the MediaMTX HTTP API and lightweight Linux files every two seconds, then broadcasts one shared WebSocket update. It does not start a poller per browser. The browser reconnects with exponential backoff and uses a 15-second REST fallback while disconnected. Existing graphs may show stale readings during outages; the UI labels the connection state. Log retention is 30 days; recent log API responses are limited to 200 rows and support pagination.

Host monitoring uses read-only bind mounts. `/host/proc/1/net/dev` and `/host/proc/1/mounts` select the host namespace, while `/host/sys/block/md0/md` supplies RAID state. An unreadable file remains unavailable. The host root mount permits OS metadata and root filesystem counters; the backend is unprivileged and provides no arbitrary-file endpoint. No Docker socket, privileged container, shell-execution endpoint, or disk modification operation is used.

## Persistence and secrets

- `postgres_data` is a named volume outside application containers. It holds application configuration as well as all database entities.
- `mediamtx/mediamtx.yml` is a persistent, read-only configuration bind mount. Runtime forwarding configuration is applied through the Control API; no decrypted keys are written to this file. Runtime forwarding state deliberately resets when the controller starts.
- Destination keys use AES-256-GCM with fresh random nonces. Normal REST and WebSocket responses never include plaintext or encrypted credential fields.
- Passwords use Argon2id. Random 256-bit session tokens are held in HttpOnly, SameSite=Strict cookies; only SHA-256 token hashes are stored in PostgreSQL. Logout revokes the current token; password change revokes all tokens. WebSocket sessions revalidate every 30 seconds.
- Mutations require `X-Requested-With: stream-control`. Browser requests must match `PUBLIC_ORIGIN`; WebSocket Origin checking is mandatory. There is no permissive CORS policy. Login is limited to ten attempts per minute per backend process.
- The backend persists curated event messages, not upstream error text or request bodies. Engine raw output is disabled because provider errors can contain credential-bearing URLs; the dashboard's MediaMTX events come from the API. Do not enable raw engine debug logging with real stream keys.
- Back up **both PostgreSQL and ENCRYPTION_KEY**. Losing the encryption key makes saved destination keys unrecoverable. Changing it requires a deliberate credential re-encryption migration, not just an environment edit.
- `JWT_SECRET` is intentionally not used: revocable server-side sessions fulfill the session/JWT requirement without a second secret or stale JWT revocation behavior.

## Development

```sh
cd frontend
npm ci
npm start
# http://localhost:4200 — /api and WebSocket proxy to localhost:3000

# In another terminal, with PostgreSQL + MediaMTX available:
cd backend
export DATABASE_URL='postgres://...'
export ADMIN_PASSWORD='...'
export ENCRYPTION_KEY='...'
export MEDIAMTX_API_URL='http://localhost:9997'
export MEDIAMTX_API_PASSWORD='...'
export PUBLIC_ORIGIN='http://localhost:4200'
export COOKIE_SECURE=false
cargo run
```

The Rust process reads environment variables directly, not `.env` files. Compose loads the project `.env`. The backend runs embedded SQL migrations at startup and requires a reachable MediaMTX 1.21 API before listening. Host monitoring is intended for Linux; Windows development leaves unsupported host readings unavailable.

```sh
cd frontend
npm run build
npm run typecheck
npm run lint
npm test
cd ../backend
cargo check --locked
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
cd ..
docker compose config --quiet
```

See [API reference](docs/API.md), [architecture and operating notes](docs/ARCHITECTURE.md), and [verification results](docs/VERIFICATION.md). A real outbound YouTube/Facebook broadcast must still be tested with your credentials and your OBS source on the target Ubuntu server.
