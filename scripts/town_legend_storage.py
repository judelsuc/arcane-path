"""Permanent shared town decisions, separate from disposable generated-content caches."""

SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS town_legends (
        town_id TEXT PRIMARY KEY, town_name TEXT NOT NULL,
        eligible INTEGER NOT NULL CHECK(eligible IN (0,1)),
        seed BIGINT, format TEXT, created DOUBLE PRECISION NOT NULL,
        CHECK((eligible=0 AND seed IS NULL AND format IS NULL) OR
              (eligible=1 AND seed IS NOT NULL AND seed BETWEEN 0 AND 4294967295
               AND format IS NOT NULL AND format IN ('platform','investigation'))))""",
    """CREATE TABLE IF NOT EXISTS town_legend_discoveries (
        journey TEXT NOT NULL, town_id TEXT NOT NULL REFERENCES town_legends(town_id),
        discovered DOUBLE PRECISION NOT NULL,
        PRIMARY KEY(journey,town_id))""",
    "CREATE INDEX IF NOT EXISTS town_legend_history ON town_legend_discoveries(journey,town_id)",
    """CREATE TABLE IF NOT EXISTS town_legend_searches (
        town_id TEXT PRIMARY KEY REFERENCES town_legends(town_id),
        map_geometry TEXT NOT NULL, payload TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS town_legend_observations (
        journey TEXT NOT NULL, town_id TEXT NOT NULL REFERENCES town_legend_searches(town_id),
        col INTEGER NOT NULL, row INTEGER NOT NULL, found INTEGER NOT NULL DEFAULT 0 CHECK(found IN (0,1)),
        PRIMARY KEY(journey,town_id,col,row))""",
    """CREATE TABLE IF NOT EXISTS town_legend_rewards (
        town_id TEXT PRIMARY KEY REFERENCES town_legends(town_id),
        payload TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS town_legend_gameplay (
        town_id TEXT PRIMARY KEY REFERENCES town_legends(town_id),
        format TEXT NOT NULL CHECK(format IN ('platform','investigation','dungeon')))""",
)
