"""Shared journal illustration queue and fenced publication status."""

from datetime import datetime, timezone
import hashlib
import json
import uuid

from asset_storage import AssetConflict, AssetError
from journeys import JourneyCapacity, JourneyRequest
from shared_images import SharedImages


SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS journal_illustrations (
        owner TEXT NOT NULL, key TEXT NOT NULL, brief TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','running','ready','failed')),
        created TEXT NOT NULL, finished TEXT, elapsed DOUBLE PRECISION, error TEXT,
        token TEXT, expires DOUBLE PRECISION,
        PRIMARY KEY(owner,key)
    )""",
    "CREATE INDEX IF NOT EXISTS journal_illustrations_queue ON journal_illustrations(status,created)",
    "CREATE TABLE IF NOT EXISTS journal_illustrations_lock (id INTEGER PRIMARY KEY CHECK(id=1))",
    "INSERT INTO journal_illustrations_lock(id) VALUES(1) ON CONFLICT(id) DO NOTHING",
)


class JournalStorage:
    def __init__(self, assets):
        self.assets, self.catalogue = assets, assets.catalogue

    @staticmethod
    def request_id(owner, key):
        return hashlib.sha256(json.dumps([owner, key], separators=(",", ":")).encode()).hexdigest()

    def clock(self):
        return ("EXTRACT(EPOCH FROM clock_timestamp())" if self.catalogue.postgres
                else "(julianday('now') - 2440587.5) * 86400.0")

    def lock(self, db):
        if self.catalogue.postgres:
            if db.execute("SELECT id FROM journal_illustrations_lock WHERE id=1 FOR UPDATE").fetchone() is None:
                raise AssetError("Journal queue lock is missing; initialize the shared schema.")
        else:
            db.execute("BEGIN IMMEDIATE")

    def enqueue(self, owner, brief, *, per_owner, total_limit, queue_limit=32):
        with self.catalogue.connection() as db:
            self.lock(db)
            existing = db.execute(self.catalogue.sql(
                "SELECT 1 FROM journal_illustrations WHERE owner=? AND key=?"), (owner, brief["key"])).fetchone()
            if existing:
                return
            count = db.execute(self.catalogue.sql(
                "SELECT COUNT(*) FROM journal_illustrations WHERE owner=?"), (owner,)).fetchone()[0]
            total = db.execute("SELECT COUNT(*) FROM journal_illustrations").fetchone()[0]
            queued = db.execute(
                "SELECT COUNT(*) FROM journal_illustrations WHERE status IN ('queued','running')").fetchone()[0]
            if count >= per_owner or total >= total_limit or queued >= queue_limit:
                raise JourneyCapacity("Journal illustration queue is full; keep the existing journal and try later.")
            db.execute(self.catalogue.sql(
                "INSERT INTO journal_illustrations(owner,key,brief,status,created) VALUES(?,?,?,'queued',?)"),
                (owner, brief["key"], json.dumps(brief), datetime.now(timezone.utc).isoformat()))

    def entries(self, owner):
        with self.catalogue.connection() as db:
            rows = db.execute(self.catalogue.sql(
                "SELECT key,brief,status,created,finished,elapsed,error FROM journal_illustrations "
                "WHERE owner=? ORDER BY key"), (owner,)).fetchall()
        return [dict(zip(("key", "brief", "status", "created", "finished", "elapsed", "error"), row))
                for row in rows]

    def image(self, owner, key):
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "SELECT status FROM journal_illustrations WHERE owner=? AND key=?"), (owner, key)).fetchone()
        if row is None or row[0] != "ready":
            raise JourneyRequest("Illustration is not ready.")
        return self.assets.read("journal-art", self.request_id(owner, key))[1]

    def acquire(self):
        with self.catalogue.connection() as db:
            self.lock(db)
            now = float(db.execute("SELECT " + self.clock()).fetchone()[0])
            row = db.execute(self.catalogue.sql(
                "SELECT owner,key,brief FROM journal_illustrations WHERE status='queued' "
                "OR (status='running' AND expires<=?) ORDER BY created,owner,key LIMIT 1"),
                (now,)).fetchone()
            if row is None:
                return None
            token = uuid.uuid4().hex
            db.execute(self.catalogue.sql(
                "UPDATE journal_illustrations SET status='running',token=?,expires=? WHERE owner=? AND key=?"),
                (token, now + 1200, row[0], row[1]))
        return {"owner": row[0], "key": row[1], "brief": json.loads(row[2]), "token": token}

    def finish(self, job, elapsed, *, error=None):
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "UPDATE journal_illustrations SET status=?,finished=?,elapsed=?,error=? "
                "WHERE owner=? AND key=? AND token=? AND status='running' "
                "AND expires>(" + self.clock() + ") RETURNING key"),
                ("ready" if error is None else "failed", datetime.now(timezone.utc).isoformat(),
                 elapsed, error, job["owner"], job["key"], job["token"])).fetchone()
            if row is None:
                raise AssetConflict("Journal worker lease expired or ownership changed.")

    def generate(self, job, writer, prompt):
        return SharedImages(self.assets).generate(
            "journal-art", self.request_id(job["owner"], job["key"]), prompt, writer)
