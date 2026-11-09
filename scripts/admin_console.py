"""Private administrator sessions, feedback triage and cosmetic collection review."""

import argparse
from contextlib import contextmanager
import getpass
import hashlib
import hmac
from http.cookies import SimpleCookie, CookieError
import json
import logging
import os
from pathlib import Path
import re
import secrets
import time

from asset_storage import AssetError
from change_requests import SCOPE, clock, exact
from journeys import JourneyConflict, JourneyRequest
from journey_storage import StoreConnection

COOKIE = "__Host-arcane-admin"
SCHEMAS = (
    "INSERT INTO journey_store_locks(name) VALUES('admin-console') ON CONFLICT(name) DO NOTHING",
    """CREATE TABLE IF NOT EXISTS admin_sessions (
        digest TEXT PRIMARY KEY, credential TEXT NOT NULL, expires DOUBLE PRECISION NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS admin_login_limit (
        singleton INTEGER PRIMARY KEY, attempts INTEGER NOT NULL, until_time DOUBLE PRECISION NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS admin_collections (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, decisions TEXT NOT NULL,
        status TEXT NOT NULL, revision INTEGER NOT NULL, created DOUBLE PRECISION NOT NULL)""",
)


class AdminDenied(Exception):
    """Administrator authentication or CSRF verification failed."""


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def credential_file(path):
    path = Path(path)
    if path.stat().st_mode & 0o077:
        raise ValueError("Administrator credentials must not be readable by group or others.")
    value = json.loads(path.read_text())
    exact(value, ("username", "salt", "hash"), "administrator credential")
    if (not isinstance(value["username"], str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,48}", value["username"])
            or not isinstance(value["salt"], str) or not re.fullmatch(r"[a-f0-9]{32}", value["salt"])
            or not isinstance(value["hash"], str) or not re.fullmatch(r"[a-f0-9]{128}", value["hash"])):
        raise ValueError("Invalid administrator credential file.")
    return value


def bounded_text(value, label, maximum=100):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum
            or any(ord(char) < 32 for char in value)):
        raise JourneyRequest(f"Invalid {label}.")


def validate_collection(value):
    exact(value, ("version", "id", "theme", "model", "icons"), "collection")
    if type(value["version"]) is not int or value["version"] != 1:
        raise JourneyRequest("Unsupported icon collection version.")
    for key in ("id", "theme", "model"):
        bounded_text(value[key], key)
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", value["id"]):
        raise JourneyRequest("Collection ID must be a lowercase slug.")
    icons = value["icons"]
    if not isinstance(icons, list) or not 1 <= len(icons) <= 12:
        raise JourneyRequest("A collection must contain 1 to 12 icons.")
    identities, shapes = set(), set()
    for icon in icons:
        exact(icon, ("id", "en", "fr", "coat", "accent", "pixels"), "icon")
        for key in ("id", "en", "fr"):
            bounded_text(icon[key], "icon " + key)
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,47}", icon["id"]) or icon["id"] in identities:
            raise JourneyRequest("Icon IDs must be unique lowercase slugs.")
        identities.add(icon["id"])
        if any(not isinstance(icon[key], str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", icon[key])
               for key in ("coat", "accent")):
            raise JourneyRequest("Icon colours must be six-digit hexadecimal values.")
        if (not isinstance(icon["pixels"], list) or len(icon["pixels"]) != 12
                or any(not isinstance(row, str) or not re.fullmatch(r"[.ocas]{12}", row)
                       for row in icon["pixels"])):
            raise JourneyRequest("Icons require a 12 by 12 grid using . o c a s.")
        shape = "".join("." if pixel == "." else "x" for row in icon["pixels"] for pixel in row)
        if not 24 <= shape.count("x") <= 130 or "o" not in "".join(icon["pixels"]):
            raise JourneyRequest("Icon silhouettes need 24 to 130 pixels and an outline.")
        if shape in shapes:
            raise JourneyRequest("Recolours of the same silhouette cannot form a collection.")
        shapes.add(shape)
    return value


def silhouette(icon):
    return int("".join("0" if pixel == "." else "1" for row in icon["pixels"] for pixel in row), 2)


def save_collection(db, value):
    """Persist a validated immutable draft inside the caller's catalogue transaction."""
    validate_collection(value)
    encoded = json.dumps(value, sort_keys=True)
    row = db.execute("SELECT payload FROM admin_collections WHERE id=?", (value["id"],)).fetchone()
    if row:
        if row["payload"] != encoded:
            raise JourneyConflict("Collection ID already has different immutable artwork.")
        return {"id": value["id"], "existing": True}
    if db.execute("SELECT COUNT(*) FROM admin_collections").fetchone()[0] >= 5000:
        raise JourneyRequest("Cosmetic collection capacity reached. Contact the operator.")
    db.execute("INSERT INTO admin_collections VALUES(?,?,?,'draft',1,?)",
               (value["id"], encoded, "{}", time.time()))
    return {"id": value["id"], "existing": False}


class AdminConsole:
    def __init__(self, assets, credentials, *, now=time.time):
        self.assets, self.credentials, self.now = assets, Path(credentials), now
        credential_file(self.credentials)

    @classmethod
    def configured(cls, assets):
        path = os.environ.get("ARCANE_ADMIN_CREDENTIAL_FILE")
        if not path:
            return None
        if assets is None:
            raise ValueError("Administrator console requires shared asset storage.")
        return cls(assets, path)

    @contextmanager
    def transaction(self):
        with self.assets.catalogue.connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            db.begin("admin-console")
            yield db

    def login(self, data):
        exact(data, ("action", "username", "password"), "login")
        if (not isinstance(data["username"], str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,48}", data["username"])
                or not isinstance(data["password"], str) or not 1 <= len(data["password"]) <= 256):
            raise AdminDenied("Invalid administrator credentials.")
        credential = credential_file(self.credentials)
        # Reserve the attempt before hashing; failed attempts must survive request rollback.
        with self.transaction() as db:
            now = self.now()
            row = db.execute("SELECT attempts,until_time FROM admin_login_limit WHERE singleton=1").fetchone()
            if row and row["until_time"] > now and row["attempts"] >= 5:
                raise AdminDenied("Too many login attempts. Try again after fifteen minutes.")
            attempts = row["attempts"] + 1 if row and row["until_time"] > now else 1
            until = row["until_time"] if row and row["until_time"] > now else now + 900
            db.execute("INSERT INTO admin_login_limit VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE "
                       "SET attempts=excluded.attempts,until_time=excluded.until_time", (attempts, until))
        matches = hmac.compare_digest(password_hash(data["password"], credential["salt"]), credential["hash"])
        if not matches or not hmac.compare_digest(data["username"], credential["username"]):
            logging.warning("Administrator login rejected")
            raise AdminDenied("Invalid administrator credentials.")
        token = secrets.token_hex(32)
        with self.transaction() as db:
            db.execute("DELETE FROM admin_sessions WHERE expires<=?", (self.now(),))
            db.execute("INSERT INTO admin_sessions VALUES(?,?,?)",
                       (digest(token), digest(json.dumps(credential, sort_keys=True)), self.now() + 8 * 3600))
            db.execute("DELETE FROM admin_login_limit")
        return {"username": credential["username"], "csrf": digest("csrf:" + token)}, token

    def authorize(self, cookie, csrf=None):
        cookies = SimpleCookie()
        try:
            cookies.load(cookie or "")
        except CookieError as error:
            raise AdminDenied("Administrator login required.") from error
        token = cookies.get(COOKIE)
        token = token.value if token else ""
        if not re.fullmatch(r"[a-f0-9]{64}", token):
            raise AdminDenied("Administrator login required.")
        credential = credential_file(self.credentials)
        with self.assets.catalogue.connection() as raw:
            db = StoreConnection(raw, self.assets.catalogue, mapping=True)
            row = db.execute("SELECT * FROM admin_sessions WHERE digest=?", (digest(token),)).fetchone()
        if (row is None or row["expires"] <= self.now()
                or row["credential"] != digest(json.dumps(credential, sort_keys=True))):
            raise AdminDenied("Administrator session expired. Log in again.")
        expected = digest("csrf:" + token)
        if csrf is not None and (not re.fullmatch(r"[a-f0-9]{64}", csrf) or not hmac.compare_digest(csrf, expected)):
            raise AdminDenied("Invalid administrator request token.")
        return {"username": credential["username"], "csrf": expected}, token

    def request(self, data, cookie, csrf):
        if not isinstance(data, dict):
            raise JourneyRequest("Invalid administrator request.")
        action = data.get("action")
        if action == "login":
            return self.login(data)
        session, token = self.authorize(cookie, None if action == "session" else csrf or "")
        if action == "session":
            exact(data, ("action",), "session")
            return session, None
        if action == "logout":
            exact(data, ("action",), "logout")
            with self.transaction() as db:
                db.execute("DELETE FROM admin_sessions WHERE digest=?", (digest(token),))
            return {"loggedOut": True}, ""
        if action in ("feedback-list", "feedback-detail", "feedback-image", "feedback-update"):
            return self.feedback(data), None
        if action in ("collection-list", "collection-review", "collection-publish", "collection-export"):
            return self.collections(data), None
        raise JourneyRequest("Unknown administrator action.")

    def feedback(self, data):
        action = data["action"]
        if action == "feedback-list":
            exact(data, ("action", "status", "offset"), "feedback listing")
            if data["status"] not in ("all", "new", "investigating", "resolved", "dismissed"):
                raise JourneyRequest("Invalid feedback filter.")
            if type(data["offset"]) is not int or not 0 <= data["offset"] <= 10000:
                raise JourneyRequest("Invalid feedback page.")
            with self.assets.catalogue.connection() as raw:
                db = StoreConnection(raw, self.assets.catalogue, mapping=True)
                rows = db.execute("SELECT r.id,r.comment,r.created,r.expires,"
                                  "COALESCE(a.status,'new') AS review_status,COALESCE(a.revision,0) AS revision "
                                  "FROM change_requests r LEFT JOIN admin_feedback a ON a.id=r.id "
                                  "WHERE r.status='submitted' AND r.expires>(" + clock(self.assets.catalogue) + ") "
                                  "AND (?='all' OR COALESCE(a.status,'new')=?) "
                                  "ORDER BY r.created DESC,r.id DESC LIMIT 21 OFFSET ?",
                                  (data["status"], data["status"], data["offset"])).fetchall()
            return {"items": [dict(row) for row in rows[:20]], "hasMore": len(rows) > 20}
        fields = ("action", "id", "status", "note", "revision") if action == "feedback-update" else ("action", "id")
        exact(data, fields, "feedback review")
        if not isinstance(data["id"], str) or not re.fullmatch(r"[a-f0-9]{32}", data["id"]):
            raise JourneyRequest("Invalid feedback ID.")
        with self.transaction() as db:
            row = db.execute("SELECT r.comment,r.snapshot,r.image_sha256,COALESCE(a.status,'new') AS review_status,"
                             "COALESCE(a.note,'') AS note,COALESCE(a.revision,0) AS revision "
                             "FROM change_requests r LEFT JOIN admin_feedback a ON a.id=r.id "
                             "WHERE r.id=? AND r.status='submitted' AND r.expires>(" +
                             clock(self.assets.catalogue) + ")", (data["id"],)).fetchone()
            if row is None:
                raise JourneyRequest("Feedback is missing or expired.")
            if action == "feedback-update":
                if (data["status"] not in ("new", "investigating", "resolved", "dismissed")
                        or not isinstance(data["note"], str) or len(data["note"]) > 2000
                        or type(data["revision"]) is not int):
                    raise JourneyRequest("Invalid feedback review.")
                if data["revision"] != row["revision"]:
                    raise JourneyConflict("Feedback changed. Reload before saving.")
                db.execute("INSERT INTO admin_feedback VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE "
                           "SET status=excluded.status,note=excluded.note,revision=excluded.revision",
                           (data["id"], data["status"], data["note"], row["revision"] + 1))
                return {"revision": row["revision"] + 1}
        if action == "feedback-image":
            record, body = self.assets.read(SCOPE, data["id"])
            if record.sha256 != row["image_sha256"]:
                raise AssetError("Feedback screenshot checksum mismatch.")
            return body
        return {"id": data["id"], "comment": row["comment"], "snapshot": json.loads(row["snapshot"]),
                "status": row["review_status"], "note": row["note"], "revision": row["revision"]}

    def collections(self, data):
        action = data["action"]
        if action == "collection-export":
            exact(data, ("action", "id"), "collection export")
            if not isinstance(data["id"], str):
                raise JourneyRequest("Invalid collection identity.")
            with self.assets.catalogue.connection() as raw:
                db = StoreConnection(raw, self.assets.catalogue, mapping=True)
                row = db.execute("SELECT payload,decisions FROM admin_collections WHERE id=? AND status='published'",
                                 (data["id"],)).fetchone()
            if row is None:
                raise JourneyRequest("Only published collections can be exported.")
            collection, decisions = json.loads(row["payload"]), json.loads(row["decisions"])
            return {**collection, "icons": [icon for icon in collection["icons"]
                                           if decisions.get(icon["id"]) == "approved"]}
        if action == "collection-list":
            exact(data, ("action", "offset"), "collection listing")
            if type(data["offset"]) is not int or not 0 <= data["offset"] <= 10000:
                raise JourneyRequest("Invalid collection page.")
            with self.assets.catalogue.connection() as raw:
                db = StoreConnection(raw, self.assets.catalogue, mapping=True)
                rows = db.execute("SELECT * FROM admin_collections ORDER BY created DESC,id DESC LIMIT 21 OFFSET ?",
                                  (data["offset"],)).fetchall()
                published = db.execute("SELECT id,payload,decisions FROM admin_collections WHERE status='published' "
                                       "ORDER BY id").fetchall()
                attempts = db.execute(
                    "SELECT d.day,d.theme,d.family,d.palette,d.brief,d.usage,d.response_model,"
                    "CASE WHEN j.status='dispatched' AND j.expires<=(" + clock(self.assets.catalogue) + ") "
                    "THEN 'uncertain' WHEN j.status='leased' AND j.expires<=(" + clock(self.assets.catalogue) + ") "
                    "THEN 'failed' ELSE j.status END AS status,j.error "
                    "FROM cosmetic_days d JOIN worker_jobs j ON j.kind='daily-cosmetic-icons' AND j.request=d.day "
                    "ORDER BY d.day DESC LIMIT 14").fetchall()
            known = [(entry["id"], icon, silhouette(icon)) for entry in published
                     for icon in json.loads(entry["payload"])["icons"]
                     if json.loads(entry["decisions"]).get(icon["id"]) == "approved"]
            warnings = {}
            for row in rows[:20]:
                warnings[row["id"]] = {}
                for icon in json.loads(row["payload"])["icons"]:
                    shape = silhouette(icon)
                    for other_collection, other, other_shape in known:
                        if other_collection == row["id"] and other["id"] == icon["id"]:
                            continue
                        similarity = (shape & other_shape).bit_count() / (shape | other_shape).bit_count()
                        if similarity >= .9:
                            warnings[row["id"]][icon["id"]] = {"en": other["en"], "collection": other_collection}
                            break
            return {"items": [{**json.loads(row["payload"]), "status": row["status"],
                              "revision": row["revision"], "decisions": json.loads(row["decisions"]),
                              "warnings": warnings[row["id"]]}
                             for row in rows[:20]], "hasMore": len(rows) > 20,
                    "generation": [{**{key: row[key] for key in ("day", "theme", "family", "palette", "status",
                                                               "error", "response_model")},
                                    "title": json.loads(row["brief"])["theme"]["title"],
                                    "usage": json.loads(row["usage"]) if row["usage"] else None}
                                   for row in attempts]}
        fields = ("action", "id", "revision", "icon", "decision") if action == "collection-review" else (
            "action", "id", "revision")
        exact(data, fields, "collection decision")
        if not isinstance(data["id"], str) or type(data["revision"]) is not int:
            raise JourneyRequest("Invalid collection decision.")
        with self.transaction() as db:
            row = db.execute("SELECT * FROM admin_collections WHERE id=?", (data["id"],)).fetchone()
            if row is None or row["status"] != "draft" or row["revision"] != data["revision"]:
                raise JourneyConflict("Collection changed or is already published. Reload before reviewing.")
            collection, decisions = json.loads(row["payload"]), json.loads(row["decisions"])
            if action == "collection-review":
                if (data["icon"] not in [icon["id"] for icon in collection["icons"]]
                        or data["decision"] not in ("approved", "rejected")):
                    raise JourneyRequest("Invalid icon decision.")
                decisions[data["icon"]] = data["decision"]
                db.execute("UPDATE admin_collections SET decisions=?,revision=revision+1 WHERE id=?",
                           (json.dumps(decisions), data["id"]))
            else:
                if (len(decisions) != len(collection["icons"]) or "approved" not in decisions.values()):
                    raise JourneyRequest("Review every icon and approve at least one before publishing.")
                db.execute("UPDATE admin_collections SET status='published',revision=revision+1 WHERE id=?",
                           (data["id"],))
            logging.info("Administrator cosmetic decision: collection=%s action=%s", data["id"], action)
            return {"revision": row["revision"] + 1}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    password = commands.add_parser("password", help="Create a dedicated administrator credential file.")
    password.add_argument("--file", type=Path, required=True)
    password.add_argument("--username", required=True)
    args = parser.parse_args()
    if args.command == "password":
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,48}", args.username):
            parser.error("Username must contain 1-48 letters, digits, underscores or hyphens.")
        value = getpass.getpass("Administrator password: ")
        if not 16 <= len(value) <= 256 or value != getpass.getpass("Confirm password: "):
            parser.error("Passwords must match and contain 16-256 characters.")
        salt = secrets.token_hex(16)
        with os.fdopen(os.open(args.file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            json.dump({"username": args.username, "salt": salt, "hash": password_hash(value, salt)}, file)
        return
if __name__ == "__main__":
    main()
