"""Opt-in OVH wording for public ordinary encounters; never authoritative game state."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import json
import logging
import os
from pathlib import Path
import sqlite3
import threading
import time

from content_factory import OvhWriter, WorkshopError
from journeys import JourneyRequest, JourneyCapacity
from terraform_ovh import private_file

MODEL = "Mistral-Small-3.2-24B-Instruct-2506"
CATALOGUE = json.loads((Path(__file__).resolve().parents[1] / "public/narrative-briefs.json").read_text())
VERSION = hashlib.sha256(json.dumps(CATALOGUE, sort_keys=True).encode()).hexdigest()[:16] + "-2"
QUEUE_LIMIT = 32
MAX_TOKENS = 500


def provider_request(brief, model):
    return {
        "model": model, "stream": False, "max_tokens": MAX_TOKENS, "temperature": 0.5,
        "messages": [
            {"role": "system", "content": (
                "Write conservative, short fictional travel prose in English and French. "
                "Return only JSON with en and fr strings, each one short sentence, at most 400 characters. "
                "Use ONLY the supplied public facts. Introductions address the traveller as 'you'. "
                "Dialogue is direct NPC speech. Preserve tense and uncertainty. "
                "This is minimal paraphrasing, not scene expansion. No added setting, street surface, "
                "weather, appearance, expressions, gestures, motives or emotions unless explicitly supplied. "
                "No new people, names, places, directions, clues, riddles, secrets, numbers, "
                "rewards, costs, choices, promises, offers, consequences or outcomes. "
                "Do not add facts or explain game mechanics. Do not embellish with new events. "
                "No HTML, URLs, code, commentary or instruction to the player."
            )},
            {"role": "user", "content": json.dumps(brief, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_schema", "json_schema": {
            "name": "public_travel_wording", "strict": True,
            "schema": {"type": "object", "additionalProperties": False,
                       "properties": {lang: {"type": "string", "minLength": 5, "maxLength": 400}
                                      for lang in ("en", "fr")}, "required": ["en", "fr"]},
        }},
    }


def usage_of(response):
    usage = response.get("usage") if isinstance(response, dict) else None
    keys = ("prompt_tokens", "completion_tokens", "total_tokens")
    if (not isinstance(usage, dict) or any(type(usage.get(k)) is not int or not 0 <= usage[k] <= 1_000_000 for k in keys)
            or usage["total_tokens"] != usage["prompt_tokens"] + usage["completion_tokens"]):
        return None
    return {k: usage[k] for k in keys}


def validate_output(response):
    try:
        choices = response["choices"]
        if not isinstance(choices, list) or len(choices) != 1 or choices[0]["finish_reason"] != "stop":
            raise ValueError()
        message = choices[0]["message"]
        if message.get("refusal"):
            raise ValueError()
        value = json.loads(message["content"])
        if not isinstance(value, dict) or set(value) != {"en", "fr"}:
            raise ValueError()
        for text in value.values():
            if (not isinstance(text, str) or not 5 <= len(text) <= 400 or text.strip() != text
                    or any(ord(c) < 32 for c in text)
                    or any(marker in text.lower() for marker in ("<", ">", "http:", "https:", "```"))):
                raise ValueError()
        return value
    except (KeyError, TypeError, ValueError, IndexError) as error:
        raise WorkshopError("Invalid or incomplete OVH wording; authored text retained. No automatic retry.", 502) from error


class LiveNarrative:
    def __init__(self, journeys, authorization, writer=None):
        self.authorization, self.writer = authorization, writer
        self.path = journeys.path.parent / "live-narrative.sqlite3"
        self.lock = threading.Lock()
        self.running = False
        self.closed = False
        self.future = None
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="live-narrative") if writer else None
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported live narrative database version.")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS wording (
                    owner TEXT NOT NULL, brief TEXT NOT NULL, version TEXT NOT NULL,
                    status TEXT NOT NULL, created REAL NOT NULL, finished REAL,
                    calls INTEGER NOT NULL DEFAULT 0, usage TEXT, output TEXT, error TEXT,
                    PRIMARY KEY(owner,brief,version)
                );
                PRAGMA user_version=1;
            """)
            db.execute("UPDATE wording SET status='failed',error=?,finished=? WHERE status='running'",
                       ("Interrupted provider attempt; billing unknown. No automatic retry.", time.time()))
        self.path.chmod(0o600)
        self.kick()

    @classmethod
    def configured(cls, journeys, authorization):
        path = os.environ.get("ARCANE_LIVE_TEXT_TOKEN_FILE")
        writer = None
        if path:
            token = private_file(Path(path)).strip()
            if not token or not token.isascii() or any(c.isspace() for c in token):
                raise ValueError("Invalid private live narrative access key.")
            writer = OvhWriter(token, MODEL, provider_request)
        return cls(journeys, authorization, writer)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def request(self, data, token):
        if not isinstance(data, dict):
            raise JourneyRequest("Invalid live narrative request.")
        expected = {"journey", "brief"} | ({"keeper"} if "keeper" in data else set())
        if set(data) != expected or not isinstance(data.get("brief"), str) or data["brief"] not in CATALOGUE:
            raise JourneyRequest("Only registered public narrative briefs are accepted.")
        owner, _ = self.authorization.authorize(data, token)
        brief = data["brief"]
        with self.lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM wording WHERE owner=? AND brief=? AND version=?",
                             (owner, brief, VERSION)).fetchone()
            if row is None and self.writer and not self.closed:
                queued = db.execute("SELECT COUNT(*) FROM wording WHERE status IN ('queued','running')").fetchone()[0]
                if queued >= QUEUE_LIMIT:
                    raise JourneyCapacity("Live wording queue is full; authored text remains available.")
                db.execute("INSERT INTO wording(owner,brief,version,status,created) VALUES(?,?,?,'queued',?)",
                           (owner, brief, VERSION, time.time()))
                row = db.execute("SELECT * FROM wording WHERE owner=? AND brief=? AND version=?",
                                 (owner, brief, VERSION)).fetchone()
            totals = db.execute("SELECT SUM(calls) calls, COUNT(CASE WHEN calls>0 AND usage IS NULL THEN 1 END) unknown "
                                "FROM wording WHERE owner=?", (owner,)).fetchone()
            usage = [json.loads(r[0]) for r in db.execute(
                "SELECT usage FROM wording WHERE owner=? AND usage IS NOT NULL", (owner,))]
        self.kick()
        enabled = self.writer is not None
        return {"enabled": enabled, "brief": brief,
                "status": row["status"] if row and enabled else "disabled",
                "text": json.loads(row["output"]) if enabled and row and row["output"] else None,
                "error": row["error"] if enabled and row else None, "model": MODEL,
                "accounting": {"attempts": totals["calls"] or 0, "unknownUsage": totals["unknown"],
                               "promptTokens": sum(u["prompt_tokens"] for u in usage),
                               "completionTokens": sum(u["completion_tokens"] for u in usage)}}

    def kick(self):
        if not self.pool:
            return
        with self.lock:
            if not self.running and not self.closed:
                self.running = True
                self.future = self.pool.submit(self.drain)

    def drain(self):
        try:
            while True:
                with self.lock, self.connect() as db:
                    if self.closed:
                        self.running = False
                        return
                    db.execute("BEGIN IMMEDIATE")
                    row = db.execute("SELECT rowid,* FROM wording WHERE status='queued' ORDER BY rowid LIMIT 1").fetchone()
                    if row is None:
                        self.running = False
                        return
                    if row["version"] != VERSION or row["brief"] not in CATALOGUE:
                        db.execute("UPDATE wording SET status='failed',error=? WHERE rowid=?",
                                   ("Public brief version changed; no call made.", row["rowid"]))
                        continue
                    # Persist dispatch before network I/O: interrupted calls are never resubmitted.
                    db.execute("UPDATE wording SET status='running',calls=calls+1 WHERE rowid=?", (row["rowid"],))
                logging.info("Live narrative provider attempt: brief=%s model=%s", row["brief"], MODEL)
                output, usage, error = None, None, None
                try:
                    response = self.writer(CATALOGUE[row["brief"]])
                    usage = usage_of(response)
                    output = validate_output(response)
                except WorkshopError as failure:
                    error = str(failure)
                    logging.warning("Live narrative failed: %s", error)
                except Exception:
                    error = "Live narrative worker failed; consult server logs. No automatic retry."
                    logging.exception("Live narrative worker failed")
                with self.connect() as db:
                    db.execute("UPDATE wording SET status=?,finished=?,usage=?,output=?,error=? WHERE rowid=?",
                               ("failed" if error else "ready", time.time(),
                                json.dumps(usage) if usage else None, json.dumps(output) if output else None,
                                error, row["rowid"]))
                logging.info("Live narrative completed: brief=%s status=%s usage=%s",
                             row["brief"], "failed" if error else "ready", usage or "unknown")
        except Exception:
            logging.exception("Live narrative queue failed; queued records retained for restart")
            with self.lock:
                self.running = False

    def close(self):
        with self.lock:
            self.closed = True
        if self.pool:
            self.pool.shutdown(wait=True)
