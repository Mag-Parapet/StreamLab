# Architecture

```text
OBS -- authenticated RTMP --> MediaMTX 1.21 -- native RTMPS --> YouTube / Facebook
                                  ^
                                  | private HTTP Control API
Browser -- HTTPS / WebSocket --> nginx --> Rust / Axum --> PostgreSQL
                                            |
                                            +-- read-only Linux procfs/sysfs/statvfs
```

`MediaEngine` provides path inspection, forwarding inspection, and configuration updates. `MediaMtxEngine` calls `/v3/paths/get/live`, `/v3/paths/forward-dests/list`, and `/v3/config/paths/patch/live`. Engine responses containing configuration/last-error text are never forwarded to the browser. Destination positions are mapped under the same control mutex that serializes relay operations.

`StreamingDestination` separates provider host validation from generic destination storage. The YouTube, Facebook, and custom adapters share native forwarding; future providers can extend the trait and input validation. Encoding belongs in OBS, transport belongs in MediaMTX, and orchestration belongs in Rust.

One backend task samples all telemetry. PostgreSQL uses at most five connections. Frontend pages are lazy-loaded standalone components; signals own client state. REST initializes the dashboard and handles commands; a shared WebSocket service receives snapshots and logs with reconnect/backoff.

## Operational boundaries

- This is a single-admin, single-controller application skeleton with implemented integrations, not a clustered broadcast automation system.
- Do not manage the `live` path forwarding list from another controller. The application owns that list. A MediaMTX API credential grants full engine configuration privileges, so its port is never published.
- Native forwarding configuration is volatile by design; no automatic broadcast resumes on controller startup. Enabled destinations and encrypted credentials persist in PostgreSQL.
- The stop endpoint succeeds only after MediaMTX acknowledges an empty forwarding list. An unavailable engine returns 502; the UI must not claim it stopped a stream.
- Crash recovery closes prior open stream-session records as interrupted. MediaMTX itself can continue transporting media while the dashboard is down. On controller restart, the startup reset stops inherited forwards.
- Hardware data is read from Linux; sensor availability depends on drivers and file permissions. RAID monitoring never invokes mdadm, mount, fsck, mkfs, or shell commands.
- The application does not take ownership of File Browser or enable recording automatically. Its URL is an external link.

## Further production work

Before exposing the system beyond a trusted administrator: provision HTTPS, backups, and host firewall policy, validate the actual Ubuntu RAID/sensor mounts, and perform an OBS-to-provider acceptance test. Resource limits are starting points, not measured capacity guarantees. Add role separation, per-client distributed rate limits, audit exports, OAuth platform APIs, metrics retention, and recording management only when required. A dedicated encrypted backup/restore process and tested upgrade procedure remain deployment responsibilities.

Reference implementation details against the pinned engine version:

- [MediaMTX native forwarding](https://mediamtx.org/docs/features/forward)
- [MediaMTX v1.21.0 Control API schema](https://github.com/bluenviron/mediamtx/blob/v1.21.0/api/openapi.yaml)
- [MediaMTX authentication](https://mediamtx.org/docs/features/authentication)
