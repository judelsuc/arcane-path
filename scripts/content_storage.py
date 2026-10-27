"""Shared quest discovery and wording schemas; provider calls remain dispatch-once."""


def schemas(postgres):
    from character_encounters import SCHEMAS as ENCOUNTER_SCHEMAS
    from town_content import SCHEMA as TOWN_SCHEMA
    from change_requests import SCHEMAS as CHANGE_REQUEST_SCHEMAS
    from inscriptions import SCHEMAS as INSCRIPTION_SCHEMAS
    sequence = "BIGSERIAL PRIMARY KEY" if postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"
    return (*ENCOUNTER_SCHEMAS, TOWN_SCHEMA, *CHANGE_REQUEST_SCHEMAS, *INSCRIPTION_SCHEMAS,
        """CREATE TABLE IF NOT EXISTS quest_instances (
            owner TEXT NOT NULL, nonce TEXT NOT NULL, request TEXT NOT NULL,
            region TEXT NOT NULL, authored TEXT NOT NULL, status TEXT NOT NULL,
            created DOUBLE PRECISION NOT NULL, output TEXT,
            token TEXT, expires DOUBLE PRECISION, attempts INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(owner,nonce))""",
        """CREATE TABLE IF NOT EXISTS quest_pois (
            town TEXT PRIMARY KEY, observed DOUBLE PRECISION NOT NULL, elements TEXT NOT NULL)""",
        f"""CREATE TABLE IF NOT EXISTS narrative_wording (
            seq {sequence}, owner TEXT NOT NULL, brief TEXT NOT NULL, version TEXT NOT NULL,
            status TEXT NOT NULL, created DOUBLE PRECISION NOT NULL, finished DOUBLE PRECISION,
            calls INTEGER NOT NULL DEFAULT 0, usage TEXT, output TEXT, error TEXT, input TEXT,
            token TEXT, expires DOUBLE PRECISION, UNIQUE(owner,brief,version))""",
        """CREATE TABLE IF NOT EXISTS custom_origins (
            region TEXT PRIMARY KEY, payload TEXT NOT NULL, payload_sha256 TEXT NOT NULL,
            source_request TEXT NOT NULL, source_sha256 TEXT NOT NULL, source_size INTEGER NOT NULL,
            created DOUBLE PRECISION NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS custom_origin_leases (
            region TEXT PRIMARY KEY, token TEXT NOT NULL, expires DOUBLE PRECISION NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS travel_chunk_cache (
            chunk_id TEXT PRIMARY KEY, region TEXT NOT NULL, pipeline TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            x INTEGER NOT NULL, y INTEGER NOT NULL, status TEXT NOT NULL,
            created DOUBLE PRECISION NOT NULL, token TEXT, expires DOUBLE PRECISION,
            attempts INTEGER NOT NULL DEFAULT 0, asset_request TEXT, sha256 TEXT, error TEXT,
            UNIQUE(region,pipeline,snapshot,x,y))""",
        "CREATE INDEX IF NOT EXISTS travel_chunk_queue ON travel_chunk_cache(status,created,chunk_id)",
        """CREATE TABLE IF NOT EXISTS travel_provider_cooldowns (
            provider TEXT PRIMARY KEY, retry_at DOUBLE PRECISION NOT NULL)""",
        "INSERT INTO journey_store_locks(name) VALUES('travel-chunks') ON CONFLICT(name) DO NOTHING",
        """CREATE TABLE IF NOT EXISTS parent_path_assignments (
            assignment TEXT PRIMARY KEY, journey TEXT NOT NULL, route_key TEXT NOT NULL,
            stage INTEGER NOT NULL, start_col INTEGER NOT NULL, start_row INTEGER NOT NULL,
            land_only INTEGER NOT NULL, status TEXT NOT NULL, created DOUBLE PRECISION NOT NULL,
            token TEXT, expires DOUBLE PRECISION, attempts INTEGER NOT NULL DEFAULT 0,
            asset_request TEXT, sha256 TEXT, summary TEXT, error TEXT)""",
        "CREATE INDEX IF NOT EXISTS parent_path_queue ON parent_path_assignments(status,created)",
        "INSERT INTO journey_store_locks(name) VALUES('parent-paths') ON CONFLICT(name) DO NOTHING",
        "CREATE INDEX IF NOT EXISTS quest_instances_queue ON quest_instances(status,created)",
        "CREATE INDEX IF NOT EXISTS narrative_wording_queue ON narrative_wording(status,seq)",
        "INSERT INTO journey_store_locks(name) VALUES('quest-destinations') ON CONFLICT(name) DO NOTHING",
        "INSERT INTO journey_store_locks(name) VALUES('live-narrative') ON CONFLICT(name) DO NOTHING",
        """CREATE TABLE IF NOT EXISTS world_characters (
            character_id TEXT PRIMARY KEY, world_id TEXT NOT NULL, region TEXT NOT NULL,
            location_id TEXT NOT NULL, location_kind TEXT NOT NULL, location_name TEXT NOT NULL,
            naming_locale TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
            profile TEXT NOT NULL, knowledge TEXT NOT NULL, needs TEXT NOT NULL,
            portrait_ref TEXT, portrait_status TEXT NOT NULL, portrait_model TEXT,
            portrait_provenance TEXT NOT NULL,
            portrait_revision INTEGER NOT NULL, revision INTEGER NOT NULL, slot INTEGER NOT NULL,
            created_at DOUBLE PRECISION NOT NULL,
            UNIQUE(world_id,location_id,slot))""",
        """CREATE INDEX IF NOT EXISTS world_characters_location
            ON world_characters(world_id,region,location_id,slot)""",
        """CREATE TABLE IF NOT EXISTS character_creation_requests (
            journey TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
            character_id TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL,
            PRIMARY KEY(journey,request_id))""",
        """CREATE TABLE IF NOT EXISTS character_private_memories (
            journey TEXT NOT NULL, character_id TEXT NOT NULL, event_id TEXT NOT NULL,
            event_type TEXT NOT NULL, topic TEXT, created_at DOUBLE PRECISION NOT NULL,
            PRIMARY KEY(journey,event_id))""",
        """CREATE INDEX IF NOT EXISTS character_private_memories_history
            ON character_private_memories(journey,character_id,created_at)""",
        """CREATE TABLE IF NOT EXISTS character_private_exchanges (
            journey TEXT NOT NULL, event_id TEXT NOT NULL, character_id TEXT NOT NULL,
            topic TEXT NOT NULL, fact_ids TEXT NOT NULL, fact_version INTEGER NOT NULL DEFAULT 1,
            created_at DOUBLE PRECISION NOT NULL,
            PRIMARY KEY(journey,event_id))""",
        """CREATE TABLE IF NOT EXISTS character_quest_contracts (
            journey TEXT NOT NULL, character_id TEXT NOT NULL, contract_id TEXT NOT NULL,
            status TEXT NOT NULL, step INTEGER NOT NULL, total_steps INTEGER NOT NULL,
            outcome TEXT, updated_at DOUBLE PRECISION NOT NULL,
            PRIMARY KEY(journey,contract_id))""",
        """CREATE TABLE IF NOT EXISTS character_quest_events (
            journey TEXT NOT NULL, event_id TEXT NOT NULL, character_id TEXT NOT NULL,
            contract_id TEXT NOT NULL, event TEXT NOT NULL, step INTEGER NOT NULL,
            total_steps INTEGER NOT NULL, created_at DOUBLE PRECISION NOT NULL,
            PRIMARY KEY(journey,event_id), UNIQUE(journey,contract_id,event,step))""",
        "CREATE INDEX IF NOT EXISTS character_quest_contracts_history "
            "ON character_quest_contracts(journey,character_id,updated_at)",
        "INSERT INTO journey_store_locks(name) VALUES('character-registry') ON CONFLICT(name) DO NOTHING",
    )


def clock(catalogue):
    return ("EXTRACT(EPOCH FROM clock_timestamp())" if catalogue.postgres
            else "(julianday('now') - 2440587.5) * 86400.0")
