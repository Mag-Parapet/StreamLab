# Verification results

## Production CSS correction — 12 September 2026

The first server deployment exposed a CSP incompatibility that the development-server browser check did not cover. Angular's critical-CSS optimization emitted a stylesheet with `media="print"` and an inline `onload` handler. The Nginx `script-src 'self'` policy blocked that handler, leaving only the small inlined base styles active.

Production builds now disable `optimization.styles.inlineCritical` while retaining minification and the existing CSP. `npm run build` also runs `scripts/verify-production.mjs`, which checks that screen styles load directly, require no inline event handler, and contain the dashboard layout rules.

Update the frontend directory on the server and run `docker compose up -d --build --no-deps frontend`, then hard-refresh the browser. No database migration or backend restart is required for this correction.

Verified on 9 September 2026 in the development workspace. Dependencies are locked by `frontend/package-lock.json` and `backend/Cargo.lock`.

| Check | Result |
|---|---|
| Angular production build | Passed, approximately 294 KB initial bundle / 80 KB estimated compressed transfer |
| TypeScript strict checks | Passed |
| ESLint, zero-warning policy | Passed |
| Prettier source formatting | Passed |
| Frontend unit tests | 2 passed |
| Rust compilation and executable build | Passed |
| Rust unit / HTTP contract tests | 7 passed |
| Clippy, all targets with warnings treated as errors | Passed |
| Rust formatting | Passed |
| Installation helper tests | 8 passed: secret generation, no secret output, overwrite protection, origin/key/cookie validation, local-only dashboard binding |
| Bash installation script syntax | Passed |
| Docker Compose configuration | Passed with test-only placeholder environment values |
| MediaMTX 1.21.0 configuration validator | Passed |
| Real PostgreSQL + Axum + MediaMTX API smoke test | Passed |
| Password change and session revocation against PostgreSQL | Passed; test password restored afterward |
| Real media forwarding to independent local MediaMTX sink | Passed |
| Relay restart, stop preserving ingest, publisher disconnect, ended session history | Passed |
| Browser login, dashboard, authenticated realtime connection | Verified |
| Browser destination form | Verified masked key field, focus handling, Escape dismissal |
| Responsive layout | Desktop and 390-pixel mobile layouts inspected |

The media acceptance test generates synthetic H.264/AAC video and audio using a **test-only FFmpeg process**, sends it through the same authenticated RTMP ingest used by OBS, and confirms native MediaMTX forwarding at a second loopback-only receiver. The application does not invoke FFmpeg or transcode media. Resolution, measured bitrate, publisher state, restart, stop, and session persistence were checked against real services.

Two issues were caught by real integration tests and corrected: MediaMTX authentication uses indexed environment variables, and its forwarding positions are **one-based**. The parser also accepts current path responses that include deprecated `ready` fields alongside `online`, without duplicate-field errors.

The API smoke test covers protected reads, successful and rejected login, missing/foreign-origin CSRF protection, all read endpoints, destination create/edit/delete, write-only keys and blank-key retention, clearing keys, URL validation, safe logs, relay stop, and logout revocation. Tests operate on disposable local data. The optional `TEST_ROTATE_PASSWORD=1` branch also exercises password rotation and restores the test password.

## Remaining deployment acceptance checks

The user will install on Ubuntu independently. `INSTALL.ro.md`, `infrastructure/setup.sh`, and the read-only `infrastructure/preflight.py` provide that workflow; no remote server access or installation was performed.

- Docker image builds and a complete Linux Compose runtime were not executed; the Docker engine was unresponsive in this Windows environment. Native PostgreSQL 17.6, MediaMTX 1.21.0, and the compiled Rust backend were used for integration tests instead.
- Host CPU, disk, temperature, `/dev/md0` RAID state, and network readings must be validated on the actual Ubuntu server. No simulated host metrics were used.
- An actual OBS source and YouTube/Facebook forwarding require the user's credentials and platform broadcasts. No external platform stream was created during testing.
- HTTPS reverse-proxy behavior, firewall rules, backup/restore, target-server capacity, and long-running broadcast stability remain deployment-specific checks.

Reproducible API checks: `infrastructure/smoke-test.mjs` requires `BASE_URL`, `TEST_USER`, and `TEST_PASSWORD` for a disposable deployment with all destinations disabled. `infrastructure/relay-test.mjs` additionally requires `TEST_FFMPEG`, `TEST_OBS_PASSWORD`, and a local MediaMTX sink on ports 1936/9998. The test creates and removes only its temporary destination and never uses external providers.
