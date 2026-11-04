"""Authoritative main-game artifact transactions, separate from the lore prototype."""

SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS main_artifact_world (
        id TEXT PRIMARY KEY, region TEXT NOT NULL, payload TEXT NOT NULL,
        checksum TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS main_artifact_sessions (
        journey TEXT PRIMARY KEY, payload TEXT NOT NULL, checksum TEXT NOT NULL,
        touched DOUBLE PRECISION NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS main_artifact_receipts (
        journey TEXT NOT NULL, request TEXT NOT NULL, digest TEXT NOT NULL,
        payload TEXT NOT NULL, PRIMARY KEY(journey,request))""",
    "CREATE INDEX IF NOT EXISTS main_artifact_sessions_touched ON main_artifact_sessions(touched)",
    "INSERT INTO journey_store_locks(name) VALUES('main-artifacts') ON CONFLICT(name) DO NOTHING",
)
