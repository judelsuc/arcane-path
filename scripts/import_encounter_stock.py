"""Copy still-fresh unclaimed encounter images from the legacy SQLite stock to shared storage."""

import argparse
import logging
from pathlib import Path
import sqlite3
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))

from asset_storage import configured_storage
from encounter_art import SCENES, WEEK
from encounter_storage import EncounterStorage
from content_factory import IMAGE_LICENSE, IMAGE_MODEL

MARGIN = 3600


def legacy_images(path, now):
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        yield from db.execute(
            "SELECT id,scene,created,image FROM images WHERE claimed=0 AND created>? ORDER BY created,id",
            (now - WEEK + MARGIN,))
    finally:
        db.close()


def import_stock(path, assets, now=None):
    now = time.time() if now is None else now
    shared = EncounterStorage(assets, week=WEEK)
    imported = skipped = 0
    for identity, scene, created, image in legacy_images(path, now):
        image = bytes(image)
        if scene not in SCENES or not image.startswith(b"RIFF") or image[8:12] != b"WEBP":
            skipped += 1
            continue
        assets.publish("encounter-art", identity, image, media_type="image/webp", retention="durable",
                       provenance={"source": IMAGE_MODEL, "license": IMAGE_LICENSE, "version": "1"})
        shared.publish(identity, scene, created, len(image))
        imported += 1
    return imported, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("legacy", type=Path)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    imported, skipped = import_stock(args.legacy, configured_storage())
    logging.info("Legacy encounter stock imported: %d images, %d skipped.", imported, skipped)


if __name__ == "__main__":
    main()
