# REST and WebSocket API

JSON successes use `{ "data": ... }`; errors use `{ "error": { "message": "..." } }`. Body size limit: 32 KB. Standard HTTP status codes: 400 invalid input, 401 unauthenticated, 403 request-origin/protection failure, 404 unknown resource, 429 login limit, 500 database error, 502 MediaMTX failure. Missing/invalid JSON may use 415/422.

Every endpoint except health and login requires the `scc_session` cookie. Every mutation, including login, also requires `Content-Type: application/json` and `X-Requested-With: stream-control`. A browser Origin must equal PUBLIC_ORIGIN. Non-browser clients may omit Origin for REST; WebSocket clients must set it.

| Method | Endpoint | Result / body |
|---|---|---|
| GET | `/api/health` | Database-backed process health; no infrastructure details |
| POST | `/api/auth/login` | `{username,password}`; sets HttpOnly session cookie |
| GET | `/api/auth/me` | `{username}` |
| POST | `/api/auth/logout` | Revokes session, clears cookie |
| POST | `/api/auth/change-password` | `{current_password,new_password}`; revokes all sessions |
| GET | `/api/dashboard` | `{timestamp,stream,server,storage}` snapshot |
| GET | `/api/stream/status` | Stream part of snapshot |
| POST | `/api/stream/start` | Applies enabled destination forwards to MediaMTX |
| POST | `/api/stream/stop` | Removes forwards; preserves publisher |
| POST | `/api/stream/restart` | Removes and reapplies forwards |
| GET | `/api/stream/sessions` | Most recent 100 persisted sessions |
| GET | `/api/destinations` | Public destination DTOs; no keys |
| POST | `/api/destinations` | Create destination |
| PUT | `/api/destinations/{uuid}` | Replace editable configuration |
| DELETE | `/api/destinations/{uuid}` | Delete configuration |
| GET / PUT | `/api/settings` | Read full settings / update `preferences` object |
| GET | `/api/server/stats` | Host resource sample |
| GET | `/api/storage` | RAID and filesystem sample |
| GET | `/api/logs` | `?level=info&source=mediamtx&before=123`; newest first, up to 200 |
| WS | `/api/ws` | Authenticated updates; see below |

Destination write body:

```json
{
  "name": "YouTube", "kind": "youtube", "enabled": false,
  "url": "rtmps://a.rtmp.youtube.com/live2",
  "stream_key": "ONLY_SEND_ON_CREATE_OR_ROTATION",
  "title": "My broadcast", "description": "Local metadata",
  "clear_key": false
}
```

Kinds are `youtube`, `facebook`, `custom`. Omit `stream_key` or send an empty string to retain the existing key. `clear_key=true` removes it; disable that destination in the same request. Destination changes are rejected while relay is enabled. Maximum 20 destinations. GET adds `id`, `key_configured`, `status`; it never returns `stream_key` or `encrypted_key`.

`/api/settings` GET returns `{preferences, infrastructure}`. PUT accepts only the preferences object: `server_name`, `input_protocol` (`rtmp`), `input_port` (1935), `default_bitrate` (Kbps), `default_resolution`, `default_fps`, `file_browser_url`, `session_hours` (1–168). Infrastructure endpoints/protocol bindings require environment/Compose edits and container recreation. Current sessions retain their original expiry when the default duration changes.

WebSocket messages:

```json
{"type":"snapshot","data":{"timestamp":"...","stream":{},"server":{},"storage":{}}}
{"type":"log","data":{"id":1,"timestamp":"...","level":"info","source":"application","message":"..."}}
```

The complete snapshot schema is typed in `frontend/src/app/models.ts`. Bitrates and network rates are Mbps; RAM and disk quantities are bytes; uptimes/durations are seconds. Unsupported metrics are JSON null. No secret fields are sent through this channel. Slow subscribers receive the newest snapshot after lag; missed log entries can be recovered through REST.

Example local API session (do not store cookies in a shared directory):

```sh
curl -c /tmp/signal.cookies -H 'Content-Type: application/json' \
  -H 'X-Requested-With: stream-control' \
  --data-binary @login.json http://localhost:8088/api/auth/login
curl -b /tmp/signal.cookies http://localhost:8088/api/dashboard
```

Keep `login.json` and the cookie file private and remove them after use. For secure cookies use the HTTPS endpoint.
