"""Shared journey and notebook SQL, preserving the stores' existing row contracts."""

from asset_storage import AssetError


def schemas(postgres):
    sequence = "BIGSERIAL PRIMARY KEY" if postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"
    return (
        """CREATE TABLE IF NOT EXISTS journeys (
            id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL,
            payload TEXT NOT NULL, checksum TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS capabilities (
            journey TEXT PRIMARY KEY, digest TEXT NOT NULL, dead INTEGER NOT NULL DEFAULT 0)""",
        """CREATE TABLE IF NOT EXISTS journals (
            id TEXT PRIMARY KEY, payload TEXT NOT NULL, latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL, finder TEXT, touched DOUBLE PRECISION,
            step INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0)""",
        "CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, content TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS keepers (id TEXT PRIMARY KEY, genesis TEXT NOT NULL)",
        f"""CREATE TABLE IF NOT EXISTS rumours (
            seq {sequence}, finder TEXT NOT NULL, evidence TEXT NOT NULL,
            journal TEXT NOT NULL, observation TEXT NOT NULL, UNIQUE(finder,evidence))""",
        "CREATE INDEX IF NOT EXISTS journal_location ON journals(latitude,longitude)",
        "CREATE TABLE IF NOT EXISTS journey_store_locks (name TEXT PRIMARY KEY)",
        "INSERT INTO journey_store_locks(name) VALUES('journeys') ON CONFLICT(name) DO NOTHING",
        "INSERT INTO journey_store_locks(name) VALUES('notebooks') ON CONFLICT(name) DO NOTHING",
    )


class Record(dict):
    def __getitem__(self, key):
        return tuple(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Rows:
    def __init__(self, cursor, mapping):
        self.cursor, self.mapping = cursor, mapping

    def convert(self, row):
        if row is None or not self.mapping:
            return row
        return Record(zip((column[0] for column in self.cursor.description), row))

    def fetchone(self):
        return self.convert(self.cursor.fetchone())

    def fetchall(self):
        return [self.convert(row) for row in self.cursor.fetchall()]

    def __iter__(self):
        return (self.convert(row) for row in self.cursor)


class StoreConnection:
    """Only placeholder adaptation; callers keep explicit portable SQL and transactions."""

    def __init__(self, db, catalogue, *, mapping=False):
        self.db, self.catalogue, self.mapping = db, catalogue, mapping

    def execute(self, sql, parameters=()):
        if self.catalogue.postgres:
            sql = sql.replace("%", "%%")
        return Rows(self.db.execute(self.catalogue.sql(sql), parameters), self.mapping)

    def begin(self, name):
        if self.catalogue.postgres:
            row = self.execute("SELECT name FROM journey_store_locks WHERE name=? FOR UPDATE",
                               (name,)).fetchone()
            if row is None:
                raise AssetError("Shared journey lock is missing; initialize the catalogue.")
        else:
            self.db.execute("BEGIN IMMEDIATE")
