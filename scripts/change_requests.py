"""Private diagnostic change requests, expiring review access and operator cleanup."""

import argparse
import base64
import binascii
from datetime import datetime, timezone
import hashlib
import io
import json
import logging
import math
import os
from pathlib import Path
import re
import secrets
import sys
import warnings

from PIL import Image

from asset_storage import AssetError, AssetStorage, LocalBlobs, S3Blobs, configured_storage
from content_storage import clock
from journey_storage import StoreConnection
from journeys import JourneyCapacity, JourneyConflict, JourneyRequest

SCOPE = "change-request-screenshots"
PREFIX = "v1/durable/" + hashlib.sha256(SCOPE.encode()).hexdigest() + "/"
RETENTION = 90 * 86400
MAX_IMAGE = 3_000_000
SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS change_requests (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL,
        comment TEXT NOT NULL, snapshot TEXT NOT NULL, created DOUBLE PRECISION NOT NULL,
        expires DOUBLE PRECISION NOT NULL, status TEXT NOT NULL,
        image_sha256 TEXT NOT NULL, image_size INTEGER NOT NULL, image_key TEXT NOT NULL)""",
    "CREATE INDEX IF NOT EXISTS change_requests_retention ON change_requests(status,expires)",
    """CREATE TABLE IF NOT EXISTS change_request_retention (
        singleton INTEGER PRIMARY KEY, checked DOUBLE PRECISION NOT NULL,
        policy TEXT NOT NULL, storage TEXT NOT NULL)""",
    "INSERT INTO journey_store_locks(name) VALUES('change-requests') ON CONFLICT(name) DO NOTHING",
)


def exact(value, fields, label):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise JourneyRequest(f"Invalid {label} fields.")


def number(value, low, high, label, integer=False):
    if (type(value) not in ((int,) if integer else (int, float))
            or not math.isfinite(value) or not low <= value <= high):
        raise JourneyRequest(f"Invalid {label}.")


def validate_snapshot(value):
    exact(value, ("version", "capturedAt", "build", "language", "viewport",
                  "appearance", "visible", "game"), "snapshot")
    if type(value["version"]) is not int or value["version"] != 1 or value["language"] not in ("fr", "en"):
        raise JourneyRequest("Unsupported snapshot version or language.")
    if not isinstance(value["capturedAt"], str) or not re.fullmatch(
            r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", value["capturedAt"]):
        raise JourneyRequest("Invalid capture timestamp.")
    try:
        datetime.fromisoformat(value["capturedAt"])
    except ValueError as error:
        raise JourneyRequest("Invalid capture timestamp.") from error
    exact(value["build"], ("commit", "version"), "build")
    build = value["build"]
    if (not isinstance(build["commit"], str) or not re.fullmatch(
            r"[a-f0-9]{40}|development|unavailable", build["commit"])
            or type(build["version"]) is not int or build["version"] != 1):
        raise JourneyRequest("Invalid game build.")
    exact(value["viewport"], ("width", "height", "pixelRatio", "scrollX", "scrollY"), "viewport")
    for key in ("width", "height"):
        number(value["viewport"][key], 100, 8192, key, True)
    number(value["viewport"]["pixelRatio"], .25, 8, "pixel ratio")
    for key in ("scrollX", "scrollY"):
        number(value["viewport"][key], -100000, 100000, key, True)
    exact(value["appearance"], ("tileset", "skin"), "appearance")
    if (value["appearance"]["tileset"] not in ("ascii", "path-pixel")
            or value["appearance"]["skin"] != "default"):
        raise JourneyRequest("Unsupported diagnostic appearance.")
    exact(value["visible"], ("screen", "dialogs"), "visible game")
    if value["visible"]["screen"] not in ("title-screen", "journey-setup", "travel-controls", "game"):
        raise JourneyRequest("Invalid visible screen.")
    dialogs = value["visible"]["dialogs"]
    if (not isinstance(dialogs, list) or len(dialogs) > 8 or len(set(map(str, dialogs))) != len(dialogs)
            or any(not isinstance(item, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,79}", item)
                   for item in dialogs)):
        raise JourneyRequest("Invalid visible dialog identifiers.")
    ranges = {"col": (-8000, 8007), "row": (-8000, 8007), "elapsedMinutes": (0, 1e9),
              "distanceMeters": (0, 1e12), "health": (0, 100), "fatigue": (0, 100),
              "reserveKcal": (-1e6, 1e6), "awakeHours": (0, 1e6), "walletCents": (0, 1e12)}
    game = value["game"]
    if not isinstance(game, dict) or set(game) - {*ranges, "ended"}:
        raise JourneyRequest("Unsupported diagnostic game fields.")
    for key in game:
        if key == "ended":
            if game[key] not in (None, "sleep", "hunger", "health", "reunited", "abandoned", "other"):
                raise JourneyRequest("Invalid game outcome.")
        else:
            number(game[key], *ranges[key], key, key in ("row", "col"))
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    if len(encoded.encode()) > 8192:
        raise JourneyRequest("Diagnostic snapshot exceeds 8 KB.")
    return encoded


def validate_image(encoded, snapshot):
    if not isinstance(encoded, str) or len(encoded) > 4_000_000:
        raise JourneyRequest("Screenshot exceeds 3 MB.")
    try:
        body = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise JourneyRequest("Invalid screenshot encoding.") from error
    if not 100 <= len(body) <= MAX_IMAGE:
        raise JourneyRequest("Empty or oversized screenshot.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(body)) as image:
                width, height = image.size
                if image.format != "PNG" or not 50 <= min(width, height) or max(width, height) > 2048:
                    raise JourneyRequest("Screenshot must be a PNG no larger than 2048 pixels.")
                viewport = snapshot["viewport"]
                if abs(width / height - viewport["width"] / viewport["height"]) > .02:
                    raise JourneyRequest("Screenshot dimensions do not match the captured viewport.")
                if any(key in image.info for key in ("exif", "XML:com.adobe.xmp")):
                    raise JourneyRequest("Screenshot must not include camera metadata.")
                image.verify()
            with Image.open(io.BytesIO(body)) as image:
                image.load()
                if all(low == high for low, high in image.convert("RGB").getextrema()):
                    raise JourneyRequest("Screenshot is blank.")
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
        raise JourneyRequest("Screenshot cannot be decoded safely.") from error
    return body


def storage_identity(assets):
    blobs = assets.blobs
    if isinstance(blobs, S3Blobs):
        return hashlib.sha256((str(blobs.client.meta.endpoint_url) + "/" + blobs.bucket).encode()).hexdigest()
    if isinstance(blobs, LocalBlobs):
        return hashlib.sha256(str(blobs.root.resolve()).encode()).hexdigest()
    raise AssetError("Unsupported change request storage backend.")

def report_storage(assets):
    directory = os.environ.get("ARCANE_CHANGE_REQUESTS_LOCAL_DIR")
    if directory is None or assets is None:
        return assets
    root = Path(directory)
    if (not root.is_absolute() or root.is_symlink() or not root.is_dir()
            or root.stat().st_mode & 0o077):
        raise AssetError("Report screenshots require an existing private absolute directory (mode 0700).")
    return AssetStorage(LocalBlobs(root), assets.catalogue)


class ChangeRequests:
    def __init__(self, journeys, authorization, *, enabled=False, assets=None, manual_cleanup=False):
        self.journeys, self.authorization = journeys, authorization
        self.assets = assets if assets is not None else getattr(journeys, "assets", None)
        if manual_cleanup and (self.assets is None or not isinstance(self.assets.blobs, LocalBlobs)):
            raise AssetError("Manual report cleanup requires private local screenshot storage.")
        self.enabled = enabled
        self.manual_cleanup = manual_cleanup

    def submit(self, data, capability):
        if not self.enabled or self.assets is None:
            raise JourneyCapacity("Change requests are disabled until private storage and cleanup are configured.")
        exact(data, ("id", "journey", "comment", "snapshot", "image"), "change request")
        for field in ("id", "journey"):
            if not isinstance(data[field], str) or not re.fullmatch(r"[a-f0-9]{32}", data[field]):
                raise JourneyRequest("Invalid change request identity.")
        self.authorization.authorize(data["journey"], capability)
        comment = data["comment"]
        if (not isinstance(comment, str) or not 1 <= len(comment.strip()) <= 2000
                or any(ord(char) < 32 and char not in "\n\t" for char in comment)):
            raise JourneyRequest("Comment must contain 1 to 2000 characters.")
        snapshot = validate_snapshot(data["snapshot"])
        body = validate_image(data["image"], data["snapshot"])
        sha = hashlib.sha256(body).hexdigest()
        owner = hashlib.sha256(data["journey"].encode()).hexdigest()
        fingerprint = hashlib.sha256(json.dumps([owner, comment, snapshot, sha]).encode()).hexdigest()
        image_key = PREFIX + sha
        catalogue = self.assets.catalogue
        with catalogue.connection() as raw:
            db = StoreConnection(raw, catalogue, mapping=True)
            db.begin("change-requests")
            now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
            row = db.execute("SELECT * FROM change_requests WHERE id=?", (data["id"],)).fetchone()
            if row:
                if row["fingerprint"] != fingerprint or row["owner"] != owner:
                    raise JourneyConflict("This submission ID already belongs to different evidence.")
                if row["status"] == "submitted" and row["expires"] > now:
                    return {"id": data["id"], "status": "submitted"}
                if row["status"] != "preparing" or row["expires"] <= now:
                    raise JourneyConflict("This request is expiring; capture a new report.")
            if not self.manual_cleanup:
                retention = db.execute(
                    "SELECT checked,policy,storage FROM change_request_retention WHERE singleton=1").fetchone()
                if (retention is None or retention["checked"] < now - 7200 or retention["checked"] > now + 60
                        or retention["policy"] != "90-days-v1"
                        or retention["storage"] != storage_identity(self.assets)):
                    raise JourneyCapacity("Report collection paused: automatic private deletion is not healthy.")
            if row is None:
                deleting = db.execute(
                    "SELECT 1 FROM change_requests WHERE image_key=? AND status='deleting'",
                    (image_key,)).fetchone()
                if deleting:
                    raise JourneyCapacity("This screenshot is being removed; please retry shortly.")
                recent = db.execute(
                    "SELECT COUNT(*),MAX(created) FROM change_requests WHERE owner=? AND created>?",
                    (owner, now - 86400)).fetchone()
                if recent[0] >= 3 or recent[1] is not None and recent[1] > now - 300:
                    raise JourneyCapacity("Report limit reached: wait five minutes, maximum three per day.")
                totals = db.execute("SELECT COUNT(*),COALESCE(SUM(image_size),0) FROM change_requests").fetchone()
                if totals[0] >= 1000 or totals[1] + len(body) > 512_000_000:
                    raise JourneyCapacity("Private report storage is full; contact the server operator.")
                db.execute(
                    "INSERT INTO change_requests(id,owner,fingerprint,comment,snapshot,created,expires,status,"
                    "image_sha256,image_size,image_key) VALUES(?,?,?,?,?,?,?,'preparing',?,?,?)",
                    (data["id"], owner, fingerprint, comment, snapshot, now, now + 86400,
                     sha, len(body), image_key))
        record = self.assets.publish(SCOPE, data["id"], body, media_type="image/png",
                                     retention="durable", provenance={
                                         "source": "player-confirmed-game-view",
                                         "license": "private-diagnostic-only", "version": "screenshot-v1"})
        if record.sha256 != sha or record.key != image_key:
            raise AssetError("Stored screenshot does not match the confirmed report.")
        self.assets.read(SCOPE, data["id"])
        with catalogue.connection() as raw:
            db = StoreConnection(raw, catalogue, mapping=True)
            db.begin("change-requests")
            row = db.execute("SELECT status,created,expires FROM change_requests WHERE id=?",
                             (data["id"],)).fetchone()
            now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
            if row is None or row["status"] not in ("preparing", "submitted") or row["expires"] <= now:
                raise JourneyConflict("Report expired during persistence; contact the operator.")
            db.execute("UPDATE change_requests SET status='submitted',expires=? WHERE id=?",
                       (row["created"] + RETENTION, data["id"]))
        return {"id": data["id"], "status": "submitted"}


def delete_versions(assets, key):
    if not key.startswith(PREFIX) or not re.fullmatch(re.escape(PREFIX) + r"[a-f0-9]{64}", key):
        raise AssetError("Deletion is restricted to diagnostic screenshot keys.")
    blobs = assets.blobs
    if isinstance(blobs, LocalBlobs):
        (blobs.root / key).unlink(missing_ok=True)
        return
    if not isinstance(blobs, S3Blobs):
        raise AssetError("Unsupported private deletion backend.")
    from botocore.exceptions import BotoCoreError, ClientError
    try:
        paginator = blobs.client.get_paginator("list_object_versions")
        versions = [value for page in paginator.paginate(Bucket=blobs.bucket, Prefix=key)
                    for field in ("Versions", "DeleteMarkers") for value in page.get(field, [])
                    if value["Key"] == key]
        for value in versions:
            blobs.client.delete_object(Bucket=blobs.bucket, Key=key, VersionId=value["VersionId"])
        verify = blobs.client.list_object_versions(Bucket=blobs.bucket, Prefix=key, MaxKeys=1)
        if any(value["Key"] == key for field in ("Versions", "DeleteMarkers")
               for value in verify.get(field, [])):
            raise AssetError("Private screenshot versions remain after deletion.")
    except (BotoCoreError, ClientError) as error:
        raise AssetError("Private screenshot deletion failed; collection must remain paused.") from error


def purge(assets):
    catalogue = assets.catalogue
    # Withdraw the health stamp first; errors cannot leave collection advertised as healthy.
    with catalogue.connection() as db:
        db.execute("DELETE FROM change_request_retention WHERE singleton=1")
    probe = secrets.token_bytes(64)
    key = PREFIX + hashlib.sha256(probe).hexdigest()
    assets.blobs.put(key, probe)
    if assets.blobs.get(key) != probe:
        raise AssetError("Deletion probe integrity failed.")
    delete_versions(assets, key)
    with catalogue.connection() as raw:
        db = StoreConnection(raw, catalogue, mapping=True)
        db.begin("change-requests")
        now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
        rows = db.execute("SELECT id,image_key FROM change_requests WHERE expires<=? OR status='deleting'",
                          (now,)).fetchall()
        for row in rows:
            db.execute("UPDATE change_requests SET status='deleting' WHERE id=?", (row["id"],))
    for row in rows:
        with catalogue.connection() as db:
            active = db.execute(catalogue.sql(
                "SELECT COUNT(*) FROM change_requests WHERE image_key=? AND status<>'deleting'"),
                (row["image_key"],)).fetchone()[0]
        if not active:
            delete_versions(assets, row["image_key"])
        with catalogue.connection() as raw:
            db = StoreConnection(raw, catalogue)
            db.execute("DELETE FROM asset_catalogue WHERE scope=? AND request=?", (SCOPE, row["id"]))
            db.execute("DELETE FROM change_requests WHERE id=? AND status='deleting'", (row["id"],))
    # Incomplete writes always reserve their key before S3 dispatch. Probe leftovers are swept as well.
    if isinstance(assets.blobs, S3Blobs):
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            orphan_candidates = {value["Key"] for page in assets.blobs.client.get_paginator(
                "list_object_versions").paginate(Bucket=assets.blobs.bucket, Prefix=PREFIX)
                for field in ("Versions", "DeleteMarkers") for value in page.get(field, [])
                if value["LastModified"].timestamp() <= now - 86400}
        except (BotoCoreError, ClientError) as error:
            raise AssetError("Orphan screenshot cleanup failed.") from error
    elif isinstance(assets.blobs, LocalBlobs):
        orphan_candidates = {str(path.relative_to(assets.blobs.root)) for path in
                             (assets.blobs.root / PREFIX).glob("*")
                             if path.is_file() and path.stat().st_mtime <= now - 86400}
    else:
        raise AssetError("Unsupported private deletion backend.")
    for key in orphan_candidates:
        with catalogue.connection() as raw:
            db = StoreConnection(raw, catalogue)
            db.begin("change-requests")
            exists = db.execute("SELECT 1 FROM change_requests WHERE image_key=?", (key,)).fetchone()
            if not exists:
                delete_versions(assets, key)
    with catalogue.connection() as raw:
        db = StoreConnection(raw, catalogue)
        db.begin("change-requests")
        db.execute("DELETE FROM asset_catalogue WHERE scope=? AND NOT EXISTS "
                   "(SELECT 1 FROM change_requests WHERE id=asset_catalogue.request)", (SCOPE,))
    with catalogue.connection() as db:
        now = float(db.execute("SELECT " + clock(catalogue)).fetchone()[0])
        db.execute(catalogue.sql(
            "INSERT INTO change_request_retention(singleton,checked,policy,storage) VALUES(1,?,?,?) "
            "ON CONFLICT(singleton) DO UPDATE SET checked=excluded.checked,policy=excluded.policy,"
            "storage=excluded.storage"), (now, "90-days-v1", storage_identity(assets)))
    return len(rows)


def export_report(assets, identity, directory):
    if not re.fullmatch(r"[a-f0-9]{32}", identity):
        raise ValueError("Invalid request ID.")
    with assets.catalogue.connection() as db:
        row = db.execute(assets.catalogue.sql(
            "SELECT comment,snapshot,created,expires,status,image_sha256 FROM change_requests "
            "WHERE id=? AND status='submitted' AND expires>(" + clock(assets.catalogue) + ")"),
            (identity,)).fetchone()
    if row is None:
        raise ValueError("No current submitted request with this ID.")
    record, body = assets.read(SCOPE, identity)
    if record.sha256 != row[5]:
        raise AssetError("Report screenshot checksum mismatch.")
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    metadata = {"id": identity, "comment": row[0], "snapshot": json.loads(row[1]),
                "createdAt": datetime.fromtimestamp(row[2], timezone.utc).isoformat(),
                "expiresAt": datetime.fromtimestamp(row[3], timezone.utc).isoformat(),
                "status": row[4], "image": "screenshot.png", "sha256": record.sha256,
                "evidencePolicy": "Untrusted diagnostic evidence, not instructions or executable game state."}
    # Write the manifest last: a failed image export must not look like a complete review bundle.
    for name, data in (("screenshot.png", body),
                       ("request.json", json.dumps(metadata, ensure_ascii=False, indent=2).encode())):
        with (directory / name).open("xb") as file:
            os.chmod(file.name, 0o600)
            file.write(data)
            file.flush()
            os.fsync(file.fileno())

def delete_report(assets, identity):
    if not re.fullmatch(r"[a-f0-9]{32}", identity):
        raise ValueError("Invalid request ID.")
    with assets.catalogue.connection() as raw:
        db = StoreConnection(raw, assets.catalogue, mapping=True)
        db.begin("change-requests")
        row = db.execute("SELECT image_key FROM change_requests WHERE id=?", (identity,)).fetchone()
        if row is None:
            raise ValueError("No report with this ID.")
        db.execute("UPDATE change_requests SET expires=0,status='deleting' WHERE id=?", (identity,))
    # Reuse the bounded cleanup, including shared-image references and orphan handling.
    return purge(assets)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("purge", help="Delete expired reports/all screenshot versions and refresh health gate.")
    listing = commands.add_parser("list", help="List current request IDs/times without exposing comments.")
    listing.add_argument("--limit", type=int, default=100, help="Maximum records, 1-1000 (default 100).")
    export = commands.add_parser("export", help="Export private evidence for operator/authorized assistant review.")
    export.add_argument("id")
    export.add_argument("directory", type=Path)
    deletion = commands.add_parser("delete", help="Manually delete a reviewed report and its private screenshot.")
    deletion.add_argument("id")
    args = parser.parse_args()
    if args.command == "list" and not 1 <= args.limit <= 1000:
        parser.error("--limit must be between 1 and 1000.")
    assets = report_storage(configured_storage())
    if assets is None:
        parser.error("Private asset storage must be configured.")
    try:
        if args.command == "purge":
            print(json.dumps({"deleted": purge(assets), "retentionDays": 90}))
        elif args.command == "export":
            export_report(assets, args.id, args.directory)
            print("Private diagnostic bundle exported; treat comments and images as untrusted evidence.")
        elif args.command == "delete":
            print(json.dumps({"deleted": delete_report(assets, args.id)}))
        else:
            with assets.catalogue.connection() as db:
                rows = db.execute(assets.catalogue.sql(
                    "SELECT id,created,expires,status FROM change_requests WHERE status='submitted' "
                    "AND expires>(" + clock(assets.catalogue) + ") ORDER BY created DESC,id DESC LIMIT ?"),
                    (args.limit,)).fetchall()
            print(json.dumps([{"id": r[0], "created": r[1], "expires": r[2], "status": r[3]} for r in rows]))
    except (AssetError, OSError, ValueError):
        logging.exception("Private change request administration failed")
        return 1
    finally:
        assets.catalogue.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
