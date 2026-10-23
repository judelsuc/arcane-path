"""Private immutable assets; metadata is published only after verified blob storage."""

from contextlib import contextmanager
import atexit
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import uuid
from urllib.parse import urlparse


class AssetError(Exception):
    """A storage operation could not safely complete."""


class AssetConflict(AssetError):
    """An idempotency key was reused for different asset facts."""


class AssetNotFound(AssetError):
    """An asset does not exist in the authorized scope."""


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}", value):
        raise ValueError("Invalid asset scope or request identifier.")
    return value


@dataclass(frozen=True)
class AssetRecord:
    scope: str
    request: str
    key: str
    sha256: str
    size: int
    media_type: str
    retention: str
    provenance: dict


def blob_key(key):
    if not isinstance(key, str) or not re.fullmatch(r"v1/(durable|cache)/[a-f0-9]{64}/[a-f0-9]{64}", key):
        raise ValueError("Invalid immutable blob key.")
    return key


class LocalBlobs:
    def __init__(self, root):
        self.root = Path(root)

    def put(self, key, data):
        path = self.root / blob_key(key)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_name(path.name + "." + uuid.uuid4().hex)
        try:
            with temporary.open("xb") as stream:
                os.chmod(temporary, 0o600)
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, path)
            except FileExistsError:
                if path.read_bytes() != data:
                    raise AssetConflict("Immutable local blob already has different content.")
        finally:
            temporary.unlink(missing_ok=True)

    def get(self, key):
        return (self.root / blob_key(key)).read_bytes()


class S3Blobs:
    def __init__(self, client, bucket):
        if not isinstance(bucket, str) or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
            raise ValueError("Invalid asset bucket.")
        self.client, self.bucket = client, bucket

    def put(self, key, data):
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            self.client.put_object(Bucket=self.bucket, Key=blob_key(key), Body=data,
                                   ContentType="application/octet-stream", IfNoneMatch="*")
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 412:
                raise AssetError("S3 asset upload failed.") from error
            if self.get(key) != data:
                raise AssetConflict("Immutable S3 blob already has different content.") from error
        except BotoCoreError as error:
            raise AssetError("S3 asset upload failed.") from error

    def get(self, key):
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            response = self.client.get_object(Bucket=self.bucket, Key=blob_key(key))
            body = response["Body"]
            try:
                return body.read()
            finally:
                body.close()
        except (BotoCoreError, ClientError) as error:
            raise AssetError("S3 asset read failed.") from error


SCHEMA = """
CREATE TABLE IF NOT EXISTS asset_catalogue (
    scope TEXT NOT NULL,
    request TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (scope, request)
)
"""

JOB_SCHEMA = """
CREATE TABLE IF NOT EXISTS generation_jobs (
    kind TEXT NOT NULL,
    request TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'ready', 'failed')),
    payload TEXT NOT NULL,
    model TEXT NOT NULL,
    created TEXT NOT NULL,
    finished TEXT,
    error TEXT,
    PRIMARY KEY (kind, request)
)
"""


class AssetCatalogue:
    def __init__(self, connect=None, *, postgres=False, pool=None):
        self.connect, self.postgres, self.pool = connect, postgres, pool
        self._pool_lock = threading.Lock()
        self._pool_opened = False
        self._closed = False

    @contextmanager
    def connection(self):
        errors = (sqlite3.Error,)
        if self.postgres:
            import psycopg
            from psycopg_pool import PoolClosed, PoolTimeout, TooManyRequests
            errors += (psycopg.Error, PoolClosed, PoolTimeout, TooManyRequests)
        db = None
        try:
            if self.pool is not None:
                with self._pool_lock:
                    if self._closed:
                        raise AssetError("Asset catalogue is closed.")
                    if not self._pool_opened:
                        self.pool.open()
                        self._pool_opened = True
                with self.pool.connection() as pooled:
                    yield pooled
                return
            db = self.connect()
            with db:
                yield db
        except errors as error:
            raise AssetError("Asset catalogue operation failed.") from error
        finally:
            if db is not None:
                db.close()

    def close(self):
        with self._pool_lock:
            self._closed = True
            if self.pool is not None:
                self.pool.close()

    def initialize(self):
        from durable_jobs import SCHEMAS
        from encounter_storage import SCHEMAS as ENCOUNTER_SCHEMAS
        from journal_storage import SCHEMAS as JOURNAL_SCHEMAS
        from journey_storage import schemas as journey_schemas
        from artifact_storage import SCHEMAS as ARTIFACT_SCHEMAS
        from content_storage import schemas as content_schemas

        with self.connection() as db:
            db.execute(SCHEMA)
            db.execute(JOB_SCHEMA)
            db.execute("CREATE INDEX IF NOT EXISTS generation_jobs_latest "
                       "ON generation_jobs(kind,status,request)")
            for schema in (*SCHEMAS, *ENCOUNTER_SCHEMAS, *JOURNAL_SCHEMAS,
                           *journey_schemas(self.postgres), *ARTIFACT_SCHEMAS,
                           *content_schemas(self.postgres)):
                db.execute(schema)

    def sql(self, statement):
        return statement.replace("?", "%s") if self.postgres else statement

    def find(self, scope, request):
        identifier(scope), identifier(request)
        with self.connection() as db:
            row = db.execute(self.sql(
                "SELECT fingerprint,payload FROM asset_catalogue WHERE scope=? AND request=?"),
                (scope, request)).fetchone()
        return (row[0], AssetRecord(**json.loads(row[1]))) if row else None

    def publish(self, fingerprint, record):
        payload = json.dumps(record.__dict__, sort_keys=True, ensure_ascii=False)
        with self.connection() as db:
            db.execute(self.sql(
                "INSERT INTO asset_catalogue(scope,request,fingerprint,payload) VALUES(?,?,?,?) "
                "ON CONFLICT(scope,request) DO NOTHING"),
                (record.scope, record.request, fingerprint, payload))
            row = db.execute(self.sql(
                "SELECT fingerprint,payload FROM asset_catalogue WHERE scope=? AND request=?"),
                (record.scope, record.request)).fetchone()
            if row[0] != fingerprint:
                raise AssetConflict("This asset request already published different content or metadata.")
            return AssetRecord(**json.loads(row[1]))


class GenerationJobs:
    """Durable dispatch-once jobs; an uncertain paid call must never be retried."""

    def __init__(self, catalogue):
        self.catalogue = catalogue

    def claim(self, kind, request, payload, model):
        identifier(kind), identifier(request)
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "INSERT INTO generation_jobs(kind,request,status,payload,model,created) "
                "VALUES(?,?,'running',?,?,?) ON CONFLICT(kind,request) DO NOTHING "
                "RETURNING request"),
                (kind, request, json.dumps(payload, sort_keys=True), model,
                 datetime.now(timezone.utc).isoformat())).fetchone()
        return row is not None

    def status(self, kind, request):
        identifier(kind), identifier(request)
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "SELECT status FROM generation_jobs WHERE kind=? AND request=?"),
                (kind, request)).fetchone()
        return row[0] if row else None

    def snapshot(self, kind):
        identifier(kind)
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql("""
                WITH latest AS (
                    SELECT request,status FROM generation_jobs
                    WHERE kind=? ORDER BY request DESC LIMIT 1
                ), ready AS (
                    SELECT request,model FROM generation_jobs
                    WHERE kind=? AND status='ready' ORDER BY request DESC LIMIT 1
                )
                SELECT latest.request,latest.status,ready.request,ready.model
                FROM (SELECT 1) AS anchor
                LEFT JOIN latest ON TRUE LEFT JOIN ready ON TRUE
            """), (kind, kind)).fetchone()
        return {
            "lastAttempt": {"day": row[0], "status": row[1]} if row[0] else None,
            "image": {"day": row[2], "model": row[3]} if row[2] else None,
        }

    def finish(self, kind, request, *, error=None):
        identifier(kind), identifier(request)
        status = "failed" if error is not None else "ready"
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "UPDATE generation_jobs SET status=?,error=?,finished=? "
                "WHERE kind=? AND request=? AND status='running' RETURNING request"),
                (status, error, datetime.now(timezone.utc).isoformat(), kind, request)).fetchone()
            if row is None:
                raise AssetConflict("Generation job is missing or already finished.")

    def complete_verified(self, kind, request):
        """Reconcile only after the caller has verified a committed immutable asset."""
        identifier(kind), identifier(request)
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "UPDATE generation_jobs SET status='ready',error=NULL,finished=? "
                "WHERE kind=? AND request=? RETURNING request"),
                (datetime.now(timezone.utc).isoformat(), kind, request)).fetchone()
            if row is None:
                raise AssetConflict("Generation job is missing.")


class AssetStorage:
    def __init__(self, blobs, catalogue, *, max_bytes=12_000_000):
        if type(max_bytes) is not int or max_bytes <= 0:
            raise ValueError("Asset size limit must be positive.")
        self.blobs, self.catalogue, self.max_bytes = blobs, catalogue, max_bytes

    def publish(self, scope, request, data, *, media_type, retention, provenance):
        identifier(scope), identifier(request)
        if not isinstance(data, bytes) or not 0 < len(data) <= self.max_bytes:
            raise ValueError("Empty or oversized asset.")
        if retention not in ("durable", "cache"):
            raise ValueError("Unknown asset retention class.")
        if not isinstance(media_type, str) or not re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", media_type):
            raise ValueError("Invalid asset media type.")
        if (not isinstance(provenance, dict) or set(provenance) != {"source", "license", "version"}
                or any(not isinstance(value, str) or not 0 < len(value) <= 1000
                       or any(ord(char) < 32 for char in value) for value in provenance.values())):
            raise ValueError("Asset provenance requires source, license and version.")
        digest = hashlib.sha256(data).hexdigest()
        scope_hash = hashlib.sha256(scope.encode()).hexdigest()
        record = AssetRecord(scope, request, f"v1/{retention}/{scope_hash}/{digest}",
                             digest, len(data), media_type, retention, dict(provenance))
        fingerprint = hashlib.sha256(json.dumps(record.__dict__, sort_keys=True).encode()).hexdigest()
        previous = self.catalogue.find(scope, request)
        if previous:
            if previous[0] != fingerprint:
                raise AssetConflict("This asset request already published different content or metadata.")
            self.read(scope, request)
            return previous[1]
        self.blobs.put(record.key, data)
        self._verify(record, self.blobs.get(record.key))
        return self.catalogue.publish(fingerprint, record)

    @staticmethod
    def _verify(record, data):
        if len(data) != record.size or hashlib.sha256(data).hexdigest() != record.sha256:
            raise AssetError("Asset integrity check failed; content was not served or published.")

    def read(self, scope, request):
        found = self.catalogue.find(scope, request)
        if not found:
            raise AssetNotFound("No asset exists in this authorized scope.")
        record = found[1]
        data = self.blobs.get(record.key)
        self._verify(record, data)
        return record, data


def local_storage(root):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    database = root / "assets.sqlite3"
    catalogue = AssetCatalogue(lambda: sqlite3.connect(database, timeout=10))
    catalogue.initialize()
    database.chmod(0o600)
    return AssetStorage(LocalBlobs(root / "blobs"), catalogue)


def ovh_storage(*, dsn, endpoint, region, bucket):
    """Construct clients, without provisioning services or initializing their schema."""
    import boto3
    from botocore.config import Config
    from psycopg.conninfo import conninfo_to_dict
    from psycopg_pool import ConnectionPool

    parsed = urlparse(endpoint)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("Object storage requires an HTTPS endpoint without credentials or a path.")
    options = conninfo_to_dict(dsn)
    timeout = options.get("connect_timeout", "")
    if (options.get("sslmode") != "verify-full" or not timeout.isdecimal()
            or not 1 <= int(timeout) <= 30):
        raise ValueError("PostgreSQL requires sslmode=verify-full and a bounded connect_timeout.")
    client = boto3.client("s3", endpoint_url=endpoint, region_name=region,
                          config=Config(connect_timeout=5, read_timeout=30,
                                        retries={"mode": "standard", "total_max_attempts": 3}))
    pool = ConnectionPool(
        dsn, kwargs={"options": "-c statement_timeout=30000 -c lock_timeout=5000"},
        min_size=0, max_size=4, max_waiting=16, timeout=5, reconnect_timeout=5,
        check=ConnectionPool.check_connection, open=False)
    catalogue = AssetCatalogue(postgres=True, pool=pool)
    atexit.register(catalogue.close)
    return AssetStorage(S3Blobs(client, bucket), catalogue)


def configured_storage():
    """Opt-in, private server configuration shared by the API and generation job."""
    config_path = os.environ.get("ARCANE_ASSET_STORAGE_CONFIG_FILE")
    if config_path is None:
        return None
    from terraform_ovh import private_file

    config = json.loads(private_file(Path(config_path)))
    if not isinstance(config, dict):
        raise ValueError("Asset storage configuration must be an object.")
    if config.get("backend") == "local" and set(config) == {"backend", "root"}:
        if not isinstance(config["root"], str) or not Path(config["root"]).is_absolute():
            raise ValueError("Local asset root must be an absolute path.")
        return local_storage(config["root"])
    if config.get("backend") == "ovh" and set(config) == {"backend", "dsn", "endpoint", "region", "bucket"}:
        if any(not isinstance(value, str) or not value for value in config.values()):
            raise ValueError("OVH asset configuration values must be nonempty strings.")
        return ovh_storage(**{key: value for key, value in config.items() if key != "backend"})
    raise ValueError("Unsupported or incomplete asset storage configuration.")


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--root", type=Path, help="Isolated local asset store directory.")
    source.add_argument("--configured", action="store_true", help="Use the private server configuration.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("initialize", help="Explicitly initialize the configured catalogue and job schemas.")
    put = commands.add_parser("put", help="Publish and verify a local asset.")
    put.add_argument("file", type=Path)
    put.add_argument("--scope", required=True)
    put.add_argument("--request", required=True)
    put.add_argument("--media-type", required=True)
    put.add_argument("--retention", choices=("durable", "cache"), required=True)
    put.add_argument("--source", required=True)
    put.add_argument("--license", required=True)
    put.add_argument("--version", required=True)
    check = commands.add_parser("verify", help="Verify an already published asset.")
    check.add_argument("--scope", required=True)
    check.add_argument("--request", required=True)
    args = parser.parse_args()
    try:
        store = configured_storage() if args.configured else local_storage(args.root)
        if store is None:
            raise ValueError("Set ARCANE_ASSET_STORAGE_CONFIG_FILE before using --configured.")
        if args.command == "initialize":
            store.catalogue.initialize()
            print(json.dumps({"initialized": True}))
            return
        if args.command == "put":
            with args.file.open("rb") as stream:
                data = stream.read(store.max_bytes + 1)
            record = store.publish(args.scope, args.request, data,
                                   media_type=args.media_type, retention=args.retention,
                                   provenance={"source": args.source, "license": args.license,
                                               "version": args.version})
        else:
            record, _ = store.read(args.scope, args.request)
    except (AssetError, OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f"Asset storage failed: {error}\n")
    print(json.dumps(record.__dict__, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    main()
