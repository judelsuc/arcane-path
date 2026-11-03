"""Shared scene cache and private observations; bytes remain in verified assets."""

from asset_storage import AssetConflict, AssetError
from journeys import JourneyCapacity, JourneyRequest


SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS encounter_stock (
        id TEXT PRIMARY KEY, scene TEXT NOT NULL, created DOUBLE PRECISION NOT NULL,
        size INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS encounter_assignments (
        owner TEXT NOT NULL, occurrence TEXT NOT NULL, scene TEXT NOT NULL,
        requested DOUBLE PRECISION NOT NULL,
        image_id TEXT REFERENCES encounter_stock(id),
        PRIMARY KEY(owner,occurrence), UNIQUE(image_id)
    )""",
    "CREATE INDEX IF NOT EXISTS encounter_stock_available ON encounter_stock(scene,claimed,created)",
    "CREATE TABLE IF NOT EXISTS encounter_stock_lock (id INTEGER PRIMARY KEY CHECK(id=1))",
    "INSERT INTO encounter_stock_lock(id) VALUES(1) ON CONFLICT(id) DO NOTHING",
)


class EncounterStorage:
    def __init__(self, assets, *, week):
        self.assets, self.catalogue, self.week = assets, assets.catalogue, week

    def lock(self, db):
        if self.catalogue.postgres:
            if db.execute("SELECT id FROM encounter_stock_lock WHERE id=1 FOR UPDATE").fetchone() is None:
                raise AssetError("Encounter stock lock is missing; initialize the shared schema.")
        else:
            db.execute("BEGIN IMMEDIATE")

    def sync(self, owner, items, now):
        with self.catalogue.connection() as db:
            self.lock(db)
            count = db.execute(self.catalogue.sql(
                "SELECT COUNT(*) FROM encounter_assignments WHERE owner=?"), (owner,)).fetchone()[0]
            for item in items:
                row = db.execute(self.catalogue.sql(
                    "SELECT scene FROM encounter_assignments WHERE owner=? AND occurrence=?"),
                    (owner, item["occurrence"])).fetchone()
                if row and row[0] != item["scene"]:
                    raise JourneyRequest("An encounter cannot change its illustration scene.")
                if row is None:
                    if count >= 2000:
                        raise JourneyCapacity("This notebook has reached its encounter illustration storage limit.")
                    db.execute(self.catalogue.sql(
                        "INSERT INTO encounter_assignments(owner,occurrence,scene,requested) VALUES(?,?,?,?)"),
                        (owner, item["occurrence"], item["scene"], now))
                    count += 1
            rows = [db.execute(self.catalogue.sql(
                    "SELECT e.occurrence,e.scene,i.id,i.created FROM encounter_assignments e "
                    "LEFT JOIN encounter_stock i ON i.id=COALESCE(e.image_id,"
                    "(SELECT id FROM encounter_stock WHERE scene=e.scene ORDER BY created,id LIMIT 1)) "
                    "WHERE e.owner=? AND e.occurrence=?"),
                (owner, item["occurrence"])).fetchone() for item in items]
        return [dict(zip(("occurrence", "scene", "id", "created"), row)) for row in rows]

    def image(self, owner, occurrence, identity):
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "SELECT i.id FROM encounter_assignments e JOIN encounter_stock i ON i.scene=e.scene "
                "WHERE e.owner=? AND e.occurrence=? AND i.id=?"),
                (owner, occurrence, identity)).fetchone()
        if row is None:
            raise JourneyRequest("This encounter illustration is unavailable.")
        return self.assets.read("encounter-art", identity)[1]

    def previous(self, identity):
        with self.catalogue.connection() as db:
            row = db.execute(self.catalogue.sql(
                "SELECT scene FROM encounter_stock WHERE id=?"), (identity,)).fetchone()
        return row[0] if row else None

    def publish(self, identity, scene, now, size):
        with self.catalogue.connection() as db:
            self.lock(db)
            db.execute(self.catalogue.sql(
                "INSERT INTO encounter_stock(id,scene,created,size) VALUES(?,?,?,?) "
                "ON CONFLICT(id) DO NOTHING"), (identity, scene, now, size))
            previous = db.execute(self.catalogue.sql(
                "SELECT scene FROM encounter_stock WHERE id=?"), (identity,)).fetchone()
            if previous[0] != scene:
                raise AssetConflict("An encounter image cannot change its scene.")

    def batch_state(self, now):
        with self.catalogue.connection() as db:
            self.lock(db)
            stored = db.execute("SELECT COALESCE(SUM(size),0) FROM encounter_stock").fetchone()[0]
            pending = db.execute(self.catalogue.sql(
                "SELECT e.scene FROM encounter_assignments e LEFT JOIN encounter_stock i ON e.image_id=i.id "
                "WHERE NOT EXISTS (SELECT 1 FROM encounter_stock s WHERE s.scene=e.scene) "
                "ORDER BY e.requested,e.owner,e.occurrence LIMIT 1")).fetchone()
            counts = dict(db.execute(self.catalogue.sql(
                "SELECT scene,COUNT(*) FROM encounter_stock GROUP BY scene")).fetchall())
        return stored, pending[0] if pending else None, counts
