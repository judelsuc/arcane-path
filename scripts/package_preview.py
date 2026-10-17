"""Package tracked runtime files without credentials or local file permissions."""

import argparse
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_ROOTS = {"scripts", "public", "data"}
RUNTIME_FILES = {"config.yml", "requirements.txt"}


def runtime_path(path):
    return (path.parts[0] in RUNTIME_ROOTS or path.as_posix() in RUNTIME_FILES
            or len(path.parts) == 1 and path.suffix in {".mjs", ".js", ".html", ".css"})


def package(output, root=ROOT):
    files = subprocess.run(["git", "-C", str(root), "ls-files", "-z"],
                           capture_output=True, check=True).stdout.decode().split("\0")
    with tarfile.open(output, "w:gz", format=tarfile.PAX_FORMAT) as archive:
        for name in files:
            if not name or not runtime_path(Path(name)):
                continue
            path = root / name
            if path.is_symlink() or not path.is_file():
                raise ValueError("Runtime package requires regular tracked files.")
            info = archive.gettarinfo(str(path), arcname=name)
            info.mode = 0o644
            info.uid = info.gid = 0
            info.uname = info.gname = "root"
            info.pax_headers = {}
            with path.open("rb") as source:
                archive.addfile(info, source)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    package(args.output)
