#!/usr/bin/env python3
"""Complete one non-recursive map ring around player-requested chunks."""

import argparse
import logging
import sqlite3
import time
import urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path

from asset_storage import AssetError, configured_storage
from travel_server import ChunkStore, ROOT


def seed_existing(store):
    with store.assets.catalogue.connection() as db:
        rows = db.execute(
            "SELECT DISTINCT region,snapshot,x,y FROM travel_chunk_cache WHERE status='ready'"
        ).fetchall()
    count = 0
    for region, snapshot, x, y in rows:
        if store.fingerprints.get(region) == snapshot:
            store.request_chunks(region, [(x, y)])
            count += 1
    return count


def candidates(store, limit):
    if not 1 <= limit <= 10:
        raise ValueError("Background chunk limit must be between 1 and 10.")
    regions = sorted(store.fingerprints.items())
    if not regions:
        return []
    current = " OR ".join("(i.region=? AND i.snapshot=?)" for _ in regions)
    offsets = "(SELECT -1 AS delta UNION ALL SELECT 0 UNION ALL SELECT 1)"
    query = (
        "SELECT i.region,i.x+dx.delta AS x,i.y+dy.delta AS y,MAX(i.requested) AS requested "
        f"FROM travel_chunk_interests i CROSS JOIN {offsets} dx CROSS JOIN {offsets} dy "
        "LEFT JOIN travel_chunk_cache c ON c.region=i.region AND c.pipeline=i.pipeline "
        "AND c.snapshot=i.snapshot AND c.x=i.x+dx.delta AND c.y=i.y+dy.delta "
        f"WHERE i.pipeline=? AND ({current}) "
        "AND ABS(i.x+dx.delta)<=1000 AND ABS(i.y+dy.delta)<=1000 "
        "AND c.asset_request IS NULL AND (c.chunk_id IS NULL OR "
        "(c.status IN ('failed','queued','running') AND (c.expires IS NULL OR c.expires<=?))) "
        "GROUP BY i.region,i.x+dx.delta,i.y+dy.delta "
        "ORDER BY COALESCE(MAX(c.created),0),requested DESC,i.region,y,x LIMIT ?"
    )
    parameters = [store.pipeline, *(value for region in regions for value in region), time.time(), limit]
    with store.assets.catalogue.connection() as db:
        rows = db.execute(store.assets.catalogue.sql(query), parameters).fetchall()
    return [(region, x, y) for region, x, y, _ in rows]


def complete_ring(store, limit=2):
    work = candidates(store, limit)
    completed = 0
    for region, x, y in work:
        try:
            store.build(region, x, y)
        except (AssetError, OSError, ValueError, KeyError, ET.ParseError, urllib.error.URLError):
            logging.exception("Background map chunk failed: %s/%s/%s", region, x, y)
        else:
            completed += 1
            logging.info("Background map chunk ready: %s/%s/%s", region, x, y)
    return {"selected": len(work), "completed": completed, "failed": len(work) - completed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/travel")
    parser.add_argument("--limit", type=int, default=2)
    parser.add_argument("--seed-existing", action="store_true",
                        help="One-time bootstrap from existing cached chunks; does not download.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    assets = None
    try:
        assets = configured_storage()
        if assets is None:
            raise ValueError("Server-side map completion requires configured shared storage.")
        store = ChunkStore(cache=args.cache)
        store.set_shared_assets(assets)
        store.load_shared_origins()
        if args.seed_existing:
            logging.info("Seeded %s existing cached chunks.", seed_existing(store))
            return 0
        result = complete_ring(store, args.limit)
        logging.info("Background map completion: %s", result)
        return 1 if result["failed"] else 0
    except (AssetError, OSError, ValueError, sqlite3.Error):
        logging.exception("Background map completion unavailable")
        return 1
    finally:
        if assets is not None:
            assets.catalogue.close()


if __name__ == "__main__":
    raise SystemExit(main())
