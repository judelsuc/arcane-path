"""Shared, uncapped factual encounter retention; private dialogue stays elsewhere."""

SCHEMAS = (
    """CREATE TABLE IF NOT EXISTS character_visitor_identities (
        journey TEXT PRIMARY KEY, fictional_name TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS character_encounters (
        character_id TEXT NOT NULL, journey TEXT NOT NULL,
        first_seen DOUBLE PRECISION NOT NULL, last_seen DOUBLE PRECISION NOT NULL,
        meeting_count BIGINT NOT NULL, PRIMARY KEY(character_id,journey))""",
    """CREATE TABLE IF NOT EXISTS character_encounter_events (
        journey TEXT NOT NULL, event_id TEXT NOT NULL, character_id TEXT NOT NULL,
        seen_at DOUBLE PRECISION NOT NULL, PRIMARY KEY(journey,event_id))""",
    "CREATE INDEX IF NOT EXISTS character_encounters_visitors ON character_encounters(character_id,journey)",
    "CREATE INDEX IF NOT EXISTS character_encounter_events_history "
    "ON character_encounter_events(journey,character_id,seen_at)",
)
