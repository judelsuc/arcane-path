"""Shared leased jobs, with fencing and explicit provider dispatch accounting."""

import json
import uuid

from asset_storage import AssetConflict, AssetError, identifier


SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS worker_jobs (
        kind TEXT NOT NULL, request TEXT NOT NULL, payload TEXT NOT NULL,
        provider TEXT, status TEXT NOT NULL CHECK (
            status IN ('queued','leased','dispatched','ready','failed','uncertain')),
        token TEXT, expires DOUBLE PRECISION, attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL, error TEXT,
        PRIMARY KEY(kind,request)
    )""",
    """CREATE TABLE IF NOT EXISTS provider_quotas (
        provider TEXT PRIMARY KEY, daily_limit INTEGER, monthly_limit INTEGER,
        CHECK (daily_limit IS NULL OR daily_limit >= 0),
        CHECK (monthly_limit IS NULL OR monthly_limit >= 0)
    )""",
    """CREATE TABLE IF NOT EXISTS provider_usage (
        provider TEXT NOT NULL, period TEXT NOT NULL, calls INTEGER NOT NULL,
        PRIMARY KEY(provider,period)
    )""",
    "CREATE INDEX IF NOT EXISTS worker_jobs_claim ON worker_jobs(status,kind,request)",
)


class DurableJobs:
    def __init__(self, catalogue):
        self.catalogue = catalogue

    def _clock(self):
        return ("EXTRACT(EPOCH FROM clock_timestamp())" if self.catalogue.postgres
                else "(julianday('now') - 2440587.5) * 86400.0")

    def _now(self, db):
        return float(db.execute("SELECT " + self._clock()).fetchone()[0])

    def _transaction(self, db):
        if not self.catalogue.postgres:
            db.execute("BEGIN IMMEDIATE")

    def configure_quota(self, provider, *, daily, monthly):
        identifier(provider)
        for limit in (daily, monthly):
            if limit is not None and (type(limit) is not int or limit < 0):
                raise ValueError("Quota limits must be nonnegative integers or explicit None (unlimited).")
        with self.catalogue.connection() as db:
            db.execute(self.catalogue.sql(
                "INSERT INTO provider_quotas(provider,daily_limit,monthly_limit) VALUES(?,?,?) "
                "ON CONFLICT(provider) DO UPDATE SET daily_limit=excluded.daily_limit,"
                "monthly_limit=excluded.monthly_limit"), (provider, daily, monthly))

    def enqueue(self, kind, request, payload, *, provider=None, max_attempts=3):
        identifier(kind), identifier(request)
        if provider is not None:
            identifier(provider)
        if type(max_attempts) is not int or not 1 <= max_attempts <= 100:
            raise ValueError("Job attempts must be between 1 and 100.")
        if not isinstance(payload, dict):
            raise ValueError("Job payload must be an object.")
        encoded = json.dumps(payload, sort_keys=True, allow_nan=False)
        if len(encoded.encode()) > 64_000:
            raise ValueError("Job payload exceeds 64000 bytes.")
        with self.catalogue.connection() as db:
            db.execute(self.catalogue.sql(
                "INSERT INTO worker_jobs(kind,request,payload,provider,status,max_attempts) "
                "VALUES(?,?,?,?,'queued',?) ON CONFLICT(kind,request) DO NOTHING"),
                (kind, request, encoded, provider, max_attempts))
            row = db.execute(self.catalogue.sql(
                "SELECT payload,provider,max_attempts FROM worker_jobs WHERE kind=? AND request=?"),
                (kind, request)).fetchone()
            if tuple(row) != (encoded, provider, max_attempts):
                raise AssetConflict("Job key already has different parameters.")

    @staticmethod
    def _lease_seconds(seconds):
        if type(seconds) is not int or not 1 <= seconds <= 3600:
            raise ValueError("Lease duration must be between 1 and 3600 seconds.")

    def acquire(self, kind, *, seconds=60, request=None):
        identifier(kind)
        if request is not None:
            identifier(request)
        self._lease_seconds(seconds)
        with self.catalogue.connection() as db:
            self._transaction(db)
            now = self._now(db)
            db.execute(self.catalogue.sql(
                "UPDATE worker_jobs SET status='uncertain',error='Dispatch lease expired' "
                "WHERE kind=? AND status='dispatched' AND expires<=?"), (kind, now))
            db.execute(self.catalogue.sql(
                "UPDATE worker_jobs SET status='failed',error='Attempt limit reached' "
                "WHERE kind=? AND status='leased' AND expires<=? AND attempts>=max_attempts"),
                (kind, now))
            lock = " FOR UPDATE SKIP LOCKED" if self.catalogue.postgres else ""
            selector = " AND request=?" if request is not None else ""
            row = db.execute(self.catalogue.sql(
                "SELECT request,payload,provider FROM worker_jobs WHERE kind=? AND "
                "(status='queued' OR (status='leased' AND expires<=?)) "
                "AND attempts<max_attempts" + selector + " ORDER BY request LIMIT 1" + lock),
                (kind, now, request) if request is not None else (kind, now)).fetchone()
            if row is None:
                return None
            token = uuid.uuid4().hex
            db.execute(self.catalogue.sql(
                "UPDATE worker_jobs SET status='leased',token=?,expires=?,attempts=attempts+1 "
                "WHERE kind=? AND request=?"), (token, now + seconds, kind, row[0]))
            return {"kind": kind, "request": row[0], "payload": json.loads(row[1]),
                    "provider": row[2], "token": token}

    def renew(self, job, *, seconds=60):
        self._lease_seconds(seconds)
        with self.catalogue.connection() as db:
            self._transaction(db)
            now = self._now(db)
            row = db.execute(self.catalogue.sql(
                "UPDATE worker_jobs SET expires=? WHERE kind=? AND request=? AND token=? "
                "AND status IN ('leased','dispatched') AND expires>(" + self._clock() + ") RETURNING request"),
                (now + seconds, job["kind"], job["request"], job["token"])).fetchone()
            if row is None:
                raise AssetConflict("Job lease expired or ownership changed.")

    def dispatch(self, job):
        """Commit before an external call; quota reservations are never refunded."""
        from datetime import datetime, timezone

        with self.catalogue.connection() as db:
            self._transaction(db)
            lock = " FOR UPDATE" if self.catalogue.postgres else ""
            row = db.execute(self.catalogue.sql(
                "SELECT provider,status,token,expires FROM worker_jobs "
                "WHERE kind=? AND request=?" + lock), (job["kind"], job["request"])).fetchone()
            if row is None or row[1] != "leased" or row[2] != job["token"] or row[3] <= self._now(db):
                raise AssetConflict("Job lease expired or dispatch already occurred.")
            provider = row[0]
            if provider is None:
                raise ValueError("Only provider jobs require dispatch accounting.")
            quota = db.execute(self.catalogue.sql(
                "SELECT daily_limit,monthly_limit FROM provider_quotas WHERE provider=?" + lock),
                (provider,)).fetchone()
            if quota is None:
                raise AssetError("Provider quota is not configured; dispatch refused.")
            now = self._now(db)
            if row[3] <= now:
                raise AssetConflict("Job lease expired while waiting for quota.")
            day = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d")
            for period, limit in zip((day, day[:7]), quota):
                db.execute(self.catalogue.sql(
                    "INSERT INTO provider_usage(provider,period,calls) VALUES(?,?,0) "
                    "ON CONFLICT(provider,period) DO NOTHING"), (provider, period))
                used = db.execute(self.catalogue.sql(
                    "SELECT calls FROM provider_usage WHERE provider=? AND period=?"),
                    (provider, period)).fetchone()[0]
                if limit is not None and used >= limit:
                    raise AssetError("Shared provider call quota exhausted.")
                db.execute(self.catalogue.sql(
                    "UPDATE provider_usage SET calls=calls+1 WHERE provider=? AND period=?"),
                    (provider, period))
            db.execute(self.catalogue.sql(
                "UPDATE worker_jobs SET status='dispatched' WHERE kind=? AND request=?"),
                (job["kind"], job["request"]))

    def finish(self, job, *, error=None):
        if error is not None and (not isinstance(error, str) or not 0 < len(error) <= 2000):
            raise ValueError("Job error must contain 1 to 2000 characters.")
        with self.catalogue.connection() as db:
            self._transaction(db)
            row = db.execute(self.catalogue.sql(
                "UPDATE worker_jobs SET status=?,error=? WHERE kind=? AND request=? AND token=? "
                "AND expires>(" + self._clock() + ") "
                "AND (status='dispatched' OR (status='leased' AND provider IS NULL)) "
                "RETURNING request"),
                ("ready" if error is None else "failed", error, job["kind"], job["request"],
                 job["token"])).fetchone()
            if row is None:
                raise AssetConflict("Job lease expired, dispatch missing or ownership changed.")

    def complete_verified(self, kind, request):
        """Caller must verify the immutable result before reconciling a dispatched job."""
        identifier(kind), identifier(request)
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "UPDATE worker_jobs SET status='ready',error=NULL "
                "WHERE kind=? AND request=? AND status IN ('dispatched','uncertain','ready','failed') "
                "RETURNING request"), (kind, request)).fetchone()
            if row is None:
                raise AssetConflict("Only dispatched jobs with verified results can be reconciled.")

    def inspect(self, kind, request):
        identifier(kind), identifier(request)
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "SELECT status,attempts,error FROM worker_jobs WHERE kind=? AND request=?"),
                (kind, request)).fetchone()
        return dict(zip(("status", "attempts", "error"), row)) if row else None


def quota_limit(value):
    if value == "unlimited":
        return None
    if not value.isdecimal():
        raise ValueError("Use a nonnegative integer or 'unlimited'.")
    return int(value)


def main():
    import argparse
    import sqlite3
    from asset_storage import configured_storage

    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    quota = commands.add_parser("quota", help="Configure shared call limits; no default provider allowance.")
    quota.add_argument("--provider", required=True)
    quota.add_argument("--daily", required=True)
    quota.add_argument("--monthly", required=True)
    inspect = commands.add_parser("inspect", help="Read durable job status.")
    inspect.add_argument("--kind", required=True)
    inspect.add_argument("--request", required=True)
    args = parser.parse_args()
    try:
        storage = configured_storage()
        if storage is None:
            raise ValueError("Set ARCANE_ASSET_STORAGE_CONFIG_FILE before administering jobs.")
        jobs = DurableJobs(storage.catalogue)
        if args.command == "quota":
            daily, monthly = quota_limit(args.daily), quota_limit(args.monthly)
            jobs.configure_quota(args.provider, daily=daily, monthly=monthly)
            print(json.dumps({"provider": args.provider, "daily": daily, "monthly": monthly}))
        else:
            result = jobs.inspect(args.kind, args.request)
            if result is None:
                raise AssetError("No job exists for that key.")
            print(json.dumps(result))
    except (AssetError, ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, f"Durable jobs failed: {error}\n")


if __name__ == "__main__":
    main()
