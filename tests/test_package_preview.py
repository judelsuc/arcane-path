from pathlib import Path
import json
import subprocess
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from package_preview import package


class PreviewPackageTests(unittest.TestCase):
    def test_only_runtime_files_with_normalized_readable_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            for name in ["index.html", "public/map.json", "public/changelog.json", "scripts/travel_server.py",
                         "public/.DS_Store", "public/audio/.DS_Store",
                         "minigames/harvest-ui.mjs", "cafe-art.svg",
                         "layers/living-world/preview.html", "layers/transport/transport.mjs",
                         "infra/nginx/preview.conf", "infra/nginx/bootstrap.conf",
                         "infra/systemd/arcane-start-art.service", "infra/systemd/arcane-start-art.timer",
                         "infra/systemd/arcane-path-content-factory.conf",
                         "infra/preview.tfstate", "ovh.conf", ".env", "README.md"]:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("test")
                path.chmod(0o600)
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.name=Test", "-c",
                            "user.email=test@example.org", "commit", "-qm", "Runtime fixture"], check=True)
            (root / "public/untracked-secret").write_text("not included")
            output = root / "preview.tar.gz"
            package(output, root)
            with tarfile.open(output) as archive:
                self.assertEqual(set(archive.getnames()),
                                 {"index.html", "public/map.json", "public/changelog.json", "scripts/travel_server.py",
                                  "minigames/harvest-ui.mjs", "cafe-art.svg",
                                  "layers/living-world/preview.html", "layers/transport/transport.mjs",
                                  "infra/nginx/preview.conf", "infra/nginx/bootstrap.conf",
                                  "infra/systemd/arcane-start-art.service", "infra/systemd/arcane-start-art.timer",
                                  "infra/systemd/arcane-path-content-factory.conf",
                                  "public/release.json"})
                release = json.load(archive.extractfile("public/release.json"))
                commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"],
                                                 text=True).strip()
                self.assertEqual(release["commit"], commit)
                self.assertEqual(release["version"], 1)
                self.assertIn("packagedAt", release)
                for member in archive:
                    self.assertEqual(member.mode, 0o644)
                    self.assertEqual(member.uid, 0)
            (root / "public/.DS_Store").write_text("local metadata changed")
            package(output, root)
            (root / "lore-playtest.mjs").write_text("export const fixture = true;")
            with self.assertRaisesRegex(ValueError, "Untracked runtime source files would be omitted.*lore-playtest.mjs"):
                package(output, root)
            (root / "lore-playtest.mjs").unlink()
            (root / "index.html").write_text("uncommitted")
            with self.assertRaisesRegex(ValueError, "Commit runtime changes"):
                package(output, root)
