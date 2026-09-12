#!/usr/bin/env python3
"""Read-only Ubuntu deployment checks. Never prints resolved secrets."""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent


def configuration_errors(environment):
    errors = []
    for name in ("ADMIN_PASSWORD", "MEDIAMTX_API_PASSWORD"):
        if len(environment.get(name, "")) < 12:
            errors.append(f"{name} must contain at least 12 characters.")
    try:
        if len(base64.b64decode(environment.get("ENCRYPTION_KEY", ""), validate=True)) != 32:
            raise ValueError()
    except (ValueError, TypeError):
        errors.append("ENCRYPTION_KEY must contain 32 random bytes encoded as base64.")
    origin = environment.get("PUBLIC_ORIGIN", "")
    cookie = environment.get("COOKIE_SECURE", "")
    if cookie not in ("true", "false"):
        errors.append("COOKIE_SECURE must be exactly true or false.")
    try:
        parsed = urlsplit(origin)
        port = parsed.port
        if (parsed.scheme not in ("http", "https") or not parsed.hostname
                or parsed.path or parsed.query or parsed.fragment
                or parsed.username is not None or parsed.password is not None
                or (port is not None and not 1 <= port <= 65535)):
            raise ValueError()
        if parsed.scheme == "http" and cookie == "true":
            errors.append("Secure cookies require HTTPS; use --local only for a local HTTP evaluation.")
        if parsed.scheme == "https" and cookie != "true":
            errors.append("Set COOKIE_SECURE=true for the HTTPS deployment.")
    except ValueError:
        errors.append("PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, a path, or trailing slash.")
    return errors


def run(command, timeout=30):
    return subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=timeout, check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    args = parser.parse_args()
    env_file = args.env_file.resolve()
    failures = []

    def fail(message):
        failures.append(message)
        print(f"FAIL  {message}")

    if sys.platform != "linux":
        fail("Run this check on the Ubuntu server; host mount checks require Linux.")
    if not env_file.is_file():
        fail("Configuration file is missing. Run infrastructure/setup.sh first.")
        return 1
    mode = stat.S_IMODE(env_file.stat().st_mode)
    if sys.platform == "linux" and mode & 0o077:
        fail("Configuration is readable by other accounts. Set its permissions to 600.")
    if shutil.which("docker") is None:
        fail("Docker is not installed or is not on PATH.")
        return 1
    try:
        result = run(["docker", "compose", "--env-file", str(env_file), "config", "--format", "json"])
        if result.returncode:
            fail("Docker Compose cannot resolve configuration. Check required values with docker compose config --quiet.")
            return 1
        # Capture the resolved document in memory; never echo it or write it to disk.
        config = json.loads(result.stdout)
        services = config["services"]
        environment = services["backend"]["environment"]
        for message in configuration_errors(environment):
            fail(message)
        db_password = services["postgres"]["environment"].get("POSTGRES_PASSWORD", "")
        if len(db_password) < 12 or any(c not in "0123456789abcdefABCDEF" for c in db_password):
            fail("POSTGRES_PASSWORD must be a long hex value for this Compose database URL.")
        obs_password = services["mediamtx"]["environment"].get("MTX_AUTHINTERNALUSERS_1_PASS", "")
        if len(obs_password) < 12 or any(c not in "0123456789abcdefABCDEF" for c in obs_password):
            fail("OBS_PASSWORD must be a long hex value for the documented OBS connection format.")
        data_path = next(v["source"] for v in services["backend"]["volumes"] if v["target"] == "/host/data")
        if sys.platform == "linux":
            if not Path(data_path).is_dir():
                fail("The configured data directory does not exist. Mount the existing array first.")
            elif shutil.which("findmnt") is None:
                fail("findmnt is missing; install the Ubuntu util-linux package.")
            elif run(["findmnt", "--mountpoint", data_path, "--noheadings", "--output", "TARGET"]).returncode:
                fail("DATA_PATH is a directory but not a mounted filesystem. Verify the existing /data mount.")
            else:
                print("PASS  Data filesystem is already mounted.")
            degraded = Path("/sys/block/md0/md/degraded")
            if degraded.is_file():
                if degraded.read_text().strip() != "0":
                    print("WARN  md0 reports degraded disks. Inspect the array before broadcasting.")
                else:
                    print("PASS  md0 reports no degraded disks.")
            else:
                print("WARN  md0 RAID state is unavailable; the dashboard will show unavailable.")
        engine = run(["docker", "info", "--format", "{{.OSType}}"])
        if engine.returncode or engine.stdout.strip() != "linux":
            fail("The Linux Docker engine is unavailable to this account.")
        else:
            print("PASS  Linux Docker engine is reachable.")
    except subprocess.TimeoutExpired:
        fail("A Docker or host check timed out. Check the Docker service.")
    except (OSError, ValueError, KeyError, StopIteration, TypeError):
        fail("Could not inspect deployment configuration or host files; verify access and Compose version.")
    if failures:
        print(f"\n{len(failures)} check(s) need attention. No services or disks were changed.")
        return 1
    print("PASS  Configuration and prerequisites are ready.")
    print("Next: docker compose up -d --build")
    print("HTTPS proxy, firewall, provider credentials, and actual broadcast quality still need deployment validation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
