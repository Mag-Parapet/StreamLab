import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import preflight


class ConfigurationTests(unittest.TestCase):
    def valid(self):
        return {"ADMIN_PASSWORD": "a" * 64, "MEDIAMTX_API_PASSWORD": "b" * 64,
                "ENCRYPTION_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "PUBLIC_ORIGIN": "https://stream.example.com", "COOKIE_SECURE": "true"}

    def test_valid_config(self):
        self.assertEqual(preflight.configuration_errors(self.valid()), [])

    def test_cookie_typos_do_not_disable_security_silently(self):
        config = self.valid()
        config["COOKIE_SECURE"] = "ture"
        self.assertTrue(preflight.configuration_errors(config))

    def test_bad_key_and_origin(self):
        config = self.valid()
        config.update(ENCRYPTION_KEY="not-a-key", PUBLIC_ORIGIN="https://user:password@host/path")
        self.assertEqual(len(preflight.configuration_errors(config)), 2)

    def test_http_secure_cookie_mismatch(self):
        config = self.valid()
        config["PUBLIC_ORIGIN"] = "http://localhost:8088"
        self.assertTrue(preflight.configuration_errors(config))
        config["COOKIE_SECURE"] = "false"
        self.assertEqual(preflight.configuration_errors(config), [])


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.bash = os.environ.get("SIGNAL_TEST_BASH") or shutil.which("bash")
        if not self.bash:
            self.skipTest("Bash is required for setup script tests")
        cache = (preflight.ROOT / ".cache").resolve()
        cache.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="installation-test-", dir=cache)
        self.directory = Path(self.temporary.name).resolve()
        # Verify the exact cleanup boundary before registering recursive cleanup.
        if self.directory.parent != cache:
            raise RuntimeError("Test directory is outside the project cache")
        self.addCleanup(self.temporary.cleanup)
        self.output = self.directory / "test.env"

    def setup(self, *arguments):
        return subprocess.run([self.bash, "infrastructure/setup.sh", *arguments,
                               "--output", self.output.as_posix()], cwd=preflight.ROOT,
                              capture_output=True, text=True, timeout=30, check=False)

    def read_environment(self):
        return dict(line.split("=", 1) for line in self.output.read_text().splitlines()
                    if line and not line.startswith("#"))

    def test_generates_distinct_secrets_without_printing_them(self):
        result = self.setup("--origin", "https://STREAM.example.com:443")
        self.assertEqual(result.returncode, 0, result.stderr)
        config = self.read_environment()
        self.assertEqual(config["PUBLIC_ORIGIN"], "https://stream.example.com")
        self.assertEqual(preflight.configuration_errors(config), [])
        secrets = [config[k] for k in ("POSTGRES_PASSWORD", "ADMIN_PASSWORD", "OBS_PASSWORD", "MEDIAMTX_API_PASSWORD")]
        self.assertEqual(len(set(secrets)), 4)
        for secret in secrets:
            self.assertEqual(len(secret), 64)
            self.assertNotIn(secret, result.stdout + result.stderr)

    def test_existing_configuration_is_preserved(self):
        self.output.write_text("existing configuration\n")
        result = self.setup("--local")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.output.read_text(), "existing configuration\n")

    def test_invalid_origins_do_not_write_configuration(self):
        for origin in ("https://host/path", "https://host/", "http://public.example", "https://host\nCOOKIE_SECURE=false", "https://host:99999"):
            with self.subTest(origin=origin):
                self.assertNotEqual(self.setup("--origin", origin).returncode, 0)
                self.assertFalse(self.output.exists())

    def test_local_mode_binds_dashboard_to_loopback(self):
        result = self.setup("--local")
        self.assertEqual(result.returncode, 0, result.stderr)
        config = self.read_environment()
        self.assertEqual(config["PUBLIC_ORIGIN"], "http://localhost:8088")
        self.assertEqual(config["DASHBOARD_BIND"], "127.0.0.1")
        self.assertEqual(config["COOKIE_SECURE"], "false")


if __name__ == "__main__":
    unittest.main()
