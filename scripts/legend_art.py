"""Prepare up to two retained, free-only backgrounds for the isolated legend preview."""

import argparse
from contextlib import contextmanager
import json
import logging
import os
from pathlib import Path
import sqlite3
import tempfile

from content_factory import IMAGE_LICENSE, IMAGE_MODEL, OvhImageWriter, WorkshopError, normalize_image
from terraform_ovh import private_file

ROOT = Path(__file__).resolve().parents[1]
SCENES = {
    "passage": (
        "Imaginary old riverside cinema service passage at September dusk, "
        "weathered stone, distant river reflections, faded curtains, quiet nostalgic mystery."
    ),
    "interior": (
        "Imaginary abandoned cinema interior, dusty projection machinery, faded velvet, "
        "warm shafts of light in deep muted green shadows, quiet nostalgic mystery."
    ),
}
STYLE = (
    "Simple atmospheric pixel-art scenery for a side-view European adventure, "
    "muted green, ochre and sepia palette, broad readable shapes, wide-feeling composition. "
    "Decoration only: no people, platforms, ladders, doors, switches, collectible objects, "
    "health items, clues, lettering or interface. Keep contrast low behind foreground gameplay. "
)


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        temporary.chmod(0o644)
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class LegendArt:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported legend illustration database version.")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS backgrounds (
                    scene TEXT PRIMARY KEY, status TEXT NOT NULL,
                    brief TEXT NOT NULL, image BLOB, error TEXT
                );
                PRAGMA user_version=1;
            """)
        self.path.chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def generate(self, scene, writer, output=None):
        if scene not in SCENES:
            raise ValueError("Unknown legend background scene.")
        brief = {"prompt": SCENES[scene], "version": 1}
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT status FROM backgrounds WHERE scene=?", (scene,)).fetchone()
            if previous:
                if previous["status"] == "ready":
                    return
                raise WorkshopError(
                    f"Legend background {scene} was already attempted ({previous['status']}); "
                    "no automatic retry or paid fallback.", 409)
            db.execute("INSERT INTO backgrounds(scene,status,brief) VALUES(?,'pending',?)",
                       (scene, json.dumps(brief)))
        # Reserve before network I/O; interrupted or ambiguous calls cannot dispatch again.
        if output is not None:
            self.publish(output)
        try:
            image = normalize_image(writer(brief))
        except (WorkshopError, OSError, ValueError) as error:
            with self.connect() as db:
                db.execute("UPDATE backgrounds SET status='failed',error=? WHERE scene=?",
                           (str(error), scene))
            raise
        with self.connect() as db:
            db.execute("UPDATE backgrounds SET status='ready',image=? WHERE scene=?", (image, scene))

    def publish(self, output):
        with self.connect() as db:
            rows = {row["scene"]: row for row in db.execute("SELECT * FROM backgrounds")}
        entries = []
        for scene in SCENES:
            row = rows.get(scene)
            entry = {"scene": scene, "status": row["status"] if row else "not-generated"}
            if row is not None and row["status"] == "ready":
                if not row["image"]:
                    raise ValueError("Ready legend background has no retained image.")
                atomic_write(output / f"{scene}.webp", row["image"])
                entry["file"] = f"{scene}.webp"
            entries.append(entry)
        manifest = {"version": 1, "adventure": "last-screening", "model": IMAGE_MODEL,
                    "license": IMAGE_LICENSE, "entries": entries}
        atomic_write(output / "manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
        return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/travel")
    parser.add_argument("--output", type=Path, default=ROOT / "public/legend-art/last-screening")
    parser.add_argument("--scene", choices=SCENES, help="Generate only one of the two backgrounds.")
    parser.add_argument("--publish-only", action="store_true", help="Export retained status/images without provider calls.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    try:
        art = LegendArt(args.cache / "legend-art.sqlite3")
        if args.publish_only:
            art.publish(args.output)
            return 0
        key_path = os.environ.get("ARCANE_START_IMAGES_TOKEN_FILE")
        if not key_path:
            raise ValueError("Set ARCANE_START_IMAGES_TOKEN_FILE to a private OVH access-key file.")
        token = private_file(Path(key_path)).strip()
        if not token or not token.isascii() or any(char.isspace() for char in token):
            raise ValueError("Invalid private illustration access key.")
        writer = OvhImageWriter(token, style=STYLE)
        try:
            for scene in [args.scene] if args.scene else SCENES:
                art.generate(scene, writer, output=args.output)
        finally:
            art.publish(args.output)
    except (OSError, ValueError, sqlite3.Error, WorkshopError) as error:
        logging.error("Legend illustration preparation stopped: %s", error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
