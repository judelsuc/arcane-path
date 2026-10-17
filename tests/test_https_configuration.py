from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class HttpsConfigurationTests(unittest.TestCase):
    def test_certificate_scripts_parse_and_require_explicit_agreement(self):
        script = ROOT / "scripts/configure_https.sh"
        subprocess.run(["bash", "-n", str(script)], check=True)
        subprocess.run(["sh", "-n", str(ROOT / "scripts/renew_https_hook.sh")], check=True)
        result = subprocess.run(["bash", str(script), "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--agree-tos", result.stdout)
        for args in [[], ["--email"], ["--unknown"], ["--email", "not-an-email"]]:
            result = subprocess.run(["bash", str(script), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("password:", result.stdout)

    def test_https_config_authenticates_proxy_and_has_no_repository_catchall(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        self.assertIn('auth_basic "Arcane Path private preview";', config)
        self.assertIn("auth_basic_user_file /etc/nginx/arcane-preview.htpasswd;", config)
        self.assertNotIn("auth_basic off", config)
        self.assertIn("location / { return 404; }", config)
        self.assertIn('proxy_set_header Authorization "";', config)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", config)
        self.assertIn("limit_req_status 429;", config)
        self.assertIn("limit_req zone=arcane_creation", config)
        self.assertIn('return 429 \'{"error":', config)
        self.assertIn("add_header Retry-After 10 always;", config)
        self.assertIn("ssl_reject_handshake on;", config)
        self.assertNotIn("root /opt/arcane-path", config)

    def test_bootstrap_exposes_only_acme_and_renewal_reload_is_checked(self):
        config = (ROOT / "infra/nginx/bootstrap.conf").read_text()
        self.assertIn("location / { return 503; }", config)
        self.assertNotIn("proxy_pass", config)
        script = (ROOT / "scripts/configure_https.sh").read_text()
        self.assertIn("certbot certonly --non-interactive --agree-tos", script)
        self.assertIn("systemctl enable --now certbot.timer", script)
        self.assertIn('nftables.before-https.conf', script)
        hook = (ROOT / "scripts/renew_https_hook.sh").read_text()
        self.assertLess(hook.index("nginx -t"), hook.index("systemctl reload nginx"))
