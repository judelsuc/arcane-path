from pathlib import Path
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
            for name in ["index.html", "public/map.json", "scripts/travel_server.py",
                         "infra/preview.tfstate", "ovh.conf", ".env", "README.md"]:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("test")
                path.chmod(0o600)
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            (root / "public/untracked-secret").write_text("not included")
            output = root / "preview.tar.gz"
            package(output, root)
            with tarfile.open(output) as archive:
                self.assertEqual(set(archive.getnames()),
                                 {"index.html", "public/map.json", "scripts/travel_server.py"})
                for member in archive:
                    self.assertEqual(member.mode, 0o644)
                    self.assertEqual(member.uid, 0)
