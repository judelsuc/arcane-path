import os
from pathlib import Path
import sys
import tempfile
import unittest
import yaml
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from terraform_ovh import session_environment


class TerraformCredentialsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.rc = Path(self.directory.name) / "openrc.sh"
        self.token = Path(self.directory.name) / "token"
        self.rc.write_text(
            'export OS_AUTH_URL="https://auth.cloud.ovh.net/v3"\n'
            'export OS_REGION_NAME="EU-WEST-PAR"\n'
            'export OS_TENANT_ID="0123456789abcdef0123456789abcdef"\n'
            'export OS_PASSWORD="$(do-not-execute)"\n')
        self.token.write_text("test-token\n")
        self.rc.chmod(0o600)
        self.token.chmod(0o600)

    def test_loads_literals_without_executing_shell_or_inheriting_other_auth(self):
        with patch.dict(os.environ, {"OS_PASSWORD": "wrong", "OVH_CONSUMER_KEY": "wrong",
                                     "TF_LOG": "TRACE", "PATH": "/usr/bin"}):
            env = session_environment(self.rc, self.token)
        self.assertEqual(env["OS_TOKEN"], "test-token")
        self.assertEqual(env["OS_PROJECT_ID"], env["OS_TENANT_ID"])
        self.assertEqual(env["PATH"], "/usr/bin")
        self.assertEqual(env["OS_AUTH_TYPE"], "v3token")
        for key in ("OS_PASSWORD", "OVH_CONSUMER_KEY", "TF_LOG"):
            self.assertNotIn(key, env)

    def test_rejects_public_credentials_symlinks_and_multiline_tokens(self):
        self.token.chmod(0o644)
        with self.assertRaises(ValueError):
            session_environment(self.rc, self.token)

    def test_cloud_init_enforces_private_preview_and_nonprivileged_service(self):
        root = Path(__file__).resolve().parents[1]
        data = yaml.safe_load((root / "infra/cloud-init.yaml").read_text()
                      .replace("${admin_ipv4_cidr}", "192.0.2.1/32"))
        files = {item["path"]: item["content"] for item in data["write_files"]}
        rules = files["/etc/nftables.conf"]
        self.assertIn("table inet arcane", rules)
        self.assertIn("policy drop", rules)
        self.assertIn("tcp dport 22 ct state new accept", rules)
        self.assertNotIn("ip saddr", rules)
        self.assertNotIn("dport 8766", rules)
        self.assertNotIn("dport 80", rules)
        self.assertFalse(data["ssh_pwauth"])
        self.assertTrue(data["disable_root"])
        ssh = files["/etc/ssh/sshd_config.d/00-arcane-path.conf"]
        self.assertIn("PasswordAuthentication no", ssh)
        self.assertIn("KbdInteractiveAuthentication no", ssh)
        self.assertIn("PubkeyAuthentication yes", ssh)
        self.assertIn("AuthenticationMethods publickey", ssh)
        self.assertIn("PermitRootLogin no", ssh)
        self.assertIn("PermitOpen 127.0.0.1:8766", ssh)
        service = files["/etc/systemd/system/arcane-path.service"]
        self.assertIn("User=arcane", service)
        self.assertIn("ProtectSystem=strict", service)
        self.assertIn("ReadWritePaths=/var/lib/arcane-path", service)
        self.token.chmod(0o600)
        link = Path(self.directory.name) / "link"
        link.symlink_to(self.token)
        with self.assertRaises(ValueError):
            session_environment(self.rc, link)
        self.token.write_text("first\nsecond")
        with self.assertRaises(ValueError):
            session_environment(self.rc, self.token)

    def test_rejects_shell_expansion_wrong_region_and_wrong_endpoint(self):
        original = self.rc.read_text()
        for before, after in [
            ("EU-WEST-PAR", "$(printf EU-WEST-PAR)"),
            ("EU-WEST-PAR", "GRA11"),
            ("https://auth.cloud.ovh.net/v3", "https://example.com/v3"),
            ("0123456789abcdef0123456789abcdef", "invalid-project"),
        ]:
            with self.subTest(replacement=after):
                self.rc.write_text(original.replace(before, after))
                with self.assertRaises(ValueError):
                    session_environment(self.rc, self.token)
