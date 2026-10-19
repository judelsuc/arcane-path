"""Local, manually operated OVH AI Endpoints writing workshop; no game state."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sqlite3
import urllib.error
import urllib.request
import uuid
import warnings

from PIL import Image, UnidentifiedImageError

from terraform_ovh import private_file

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions"
LIMIT = 20
MAX_TOKENS = 1200
PROMPT_VERSION = 1
IMAGE_ENDPOINT = "https://stable-diffusion-xl.endpoints.kepler.ai.cloud.ovh.net/api/text2image"
IMAGE_MODEL = "stable-diffusion-xl-base-v10"
IMAGE_LICENSE = "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md"
IMAGE_STYLE = (
    "Dreamlike travel notebook illustration, delicate ink outlines and muted watercolor, "
    "warm textured paper, deep indigo and ochre, quiet mysterious atmosphere, "
    "simple elegant composition, no lettering, no symbols resembling a map, no people. "
)
BRIEFS = {
    "artifact-town": {
        "title": "Artifact rumour / Rumeur d'objet",
        "domain": "artifact", "precision": "town", "plainGuidancePermitted": False,
        "facts": {
            "en": "The pierced thimble was reported in Brumeval, a fictional village. Its exact hiding place is unknown.",
            "fr": "Le dé à coudre ajouré aurait été vu à Brumeval, un village fictif. Sa cachette exacte est inconnue.",
        },
        "constraints": "Uncertain town-level report only. No street, landmark, coordinates, owner, route or search condition.",
    },
    "parent-direction": {
        "title": "Parent trail / Piste du parent",
        "domain": "parent", "precision": "direction", "plainGuidancePermitted": False,
        "facts": {
            "en": "A traveller matching the parent's description was reported heading north from Brumeval. No destination is known.",
            "fr": "Une personne ressemblant au parent aurait quitté Brumeval vers le nord. Aucune destination n'est connue.",
        },
        "constraints": "Uncertain departure-direction report only. No destination, distance, later stage or identity.",
    },
    "journal-notice": {
        "title": "Journal notice / Rumeur de carnet",
        "domain": "journal", "precision": "nearby-report", "plainGuidancePermitted": False,
        "facts": {
            "en": "An unfinished travel journal was reported nearby. This past observation does not confirm it is still there.",
            "fr": "Un carnet de voyage inachevé aurait été vu dans les environs. Cette observation passée ne confirme pas sa présence actuelle.",
        },
        "constraints": "Past nearby report only. No author identity, contents, current holder, exact location or delivery instructions.",
    },
}


class WorkshopError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def output_schema():
    text = {"type": "string", "minLength": 20, "maxLength": 700}
    locale = {
        "type": "object", "additionalProperties": False,
        "properties": {"rumour": text, "riddle": text},
        "required": ["rumour", "riddle"],
    }
    return {"type": "object", "additionalProperties": False,
            "properties": {"en": locale, "fr": locale}, "required": ["en", "fr"]}


def provider_request(brief, model):
    return {
        "model": model, "stream": False, "max_tokens": MAX_TOKENS,
        "messages": [
            {"role": "system", "content": (
                "Write short mysterious but understandable narrative drafts in English and French. "
                "Return exactly the requested JSON schema. This is a fictional writing exercise. "
                "Use only the supplied facts; preserve uncertainty and information limits. "
                "Each rumour is NPC speech; each riddle is an evocative clue, not a new puzzle "
                "with an invented solution. Both must convey the same permitted evidence. "
                "Do not invent locations, directions, distances, people, events, landmarks, "
                "mechanics, rewards, prerequisites or interpretations. No plain solution, "
                "hint ladder, HTML, URLs, code or commentary. Metaphor is not a factual assertion."
            )},
            {"role": "user", "content": json.dumps(brief, ensure_ascii=False)},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "clue_drafts", "strict": True, "schema": output_schema()},
        },
    }


def validate_output(value):
    if not isinstance(value, dict) or set(value) != {"en", "fr"}:
        raise WorkshopError("OVH returned invalid bilingual JSON; no draft was accepted.", 502)
    for locale in value.values():
        if not isinstance(locale, dict) or set(locale) != {"rumour", "riddle"}:
            raise WorkshopError("OVH returned an unexpected draft structure.", 502)
        for text in locale.values():
            if (not isinstance(text, str) or not 20 <= len(text) <= 700
                    or text != text.strip() or any(ord(char) < 32 for char in text)
                    or any(marker in text.lower() for marker in ("<", ">", "http:", "https:", "```"))):
                raise WorkshopError("OVH returned invalid draft text; review the model configuration.", 502)
    return value


def validate_response(response):
    if not isinstance(response, dict):
        raise WorkshopError("OVH returned an invalid response.", 502)
    choices = response.get("choices")
    if (not isinstance(choices, list) or len(choices) != 1
            or not isinstance(choices[0], dict) or choices[0].get("finish_reason") != "stop"):
        raise WorkshopError("OVH did not finish one complete draft; no automatic retry was made.", 502)
    message = choices[0].get("message")
    if not isinstance(message, dict) or not isinstance(message.get("content"), str) or message.get("refusal"):
        raise WorkshopError("OVH did not return draft content.", 502)
    try:
        output = validate_output(json.loads(message["content"]))
    except (ValueError, UnicodeError) as error:
        raise WorkshopError("OVH returned unreadable JSON; no draft was accepted.", 502) from error
    usage = response.get("usage")
    if usage is not None:
        if (not isinstance(usage, dict) or any(
                type(usage.get(key)) is not int or usage[key] < 0
                for key in ("prompt_tokens", "completion_tokens", "total_tokens"))
                or usage["total_tokens"] != usage["prompt_tokens"] + usage["completion_tokens"]):
            raise WorkshopError("OVH returned invalid token accounting.", 502)
        usage = {key: usage[key] for key in ("prompt_tokens", "completion_tokens", "total_tokens")}
    actual_model = response.get("model")
    if actual_model is not None and (not isinstance(actual_model, str)
                                     or not re.fullmatch(r"[A-Za-z0-9._:/-]{1,160}", actual_model)):
        raise WorkshopError("OVH returned invalid model metadata.", 502)
    return {"drafts": output, "usage": usage, "responseModel": actual_model}


class OvhWriter:
    def __init__(self, token, model, request_builder=provider_request):
        self.token, self.model = token, model
        self.request_builder = request_builder
        self.opener = urllib.request.build_opener(NoRedirect())

    def __call__(self, brief):
        request = urllib.request.Request(
            ENDPOINT, data=json.dumps(self.request_builder(brief, self.model)).encode(),
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json",
                     "Accept": "application/json", "User-Agent": "ArcanePath-ContentWorkshop/1"},
        )
        try:
            with self.opener.open(request, timeout=45) as response:
                if response.status != 200 or response.headers.get_content_type() != "application/json":
                    raise WorkshopError("OVH returned an unexpected response type.", 502)
                raw = response.read(64 * 1024 + 1)
                if len(raw) > 64 * 1024:
                    raise WorkshopError("OVH response exceeded the 64 KiB size limit.", 502)
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            error.close()
            raise WorkshopError(
                f"OVH request failed (HTTP {error.code}). Check key, model, quota and structured-output support. "
                "This attempt may have been billed; no automatic retry was made.", 502,
            ) from None
        except (OSError, ValueError) as error:
            raise WorkshopError(
                "OVH response unavailable or unreadable. This attempt may have been billed; "
                "no automatic retry was made.", 502,
            ) from error


def normalize_image(raw):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 10 * 1024 * 1024:
        raise WorkshopError("OVH image is empty or exceeds the 10 MiB limit.", 502)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"JPEG", "PNG"} or image.size != (1024, 1024):
                    raise WorkshopError("OVH must return one 1024 x 1024 JPEG or PNG image.", 502)
                image.load()
                output = io.BytesIO()
                image.convert("RGB").save(output, format="WEBP", quality=85, method=4)
                return output.getvalue()
    except (OSError, ValueError, UnidentifiedImageError,
            Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise WorkshopError("OVH returned an invalid image; nothing was published.", 502) from error


class OvhImageWriter:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def __call__(self, theme):
        try:
            # Never substitute a paid model if the free offer changes or cannot be verified.
            with self.opener.open(
                    "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models", timeout=15) as response:
                raw = response.read(64 * 1024 + 1)
                if response.status != 200 or len(raw) > 64 * 1024:
                    raise WorkshopError("Cannot verify OVH's free image offer; generation stopped.", 503)
                catalogue = json.loads(raw)
            models = catalogue.get("data") if isinstance(catalogue, dict) else None
            matches = [model for model in models if isinstance(model, dict)
                       and model.get("id") == IMAGE_MODEL] if isinstance(models, list) else []
            pricing = matches[0].get("pricing") if len(matches) == 1 else None
            if (not isinstance(pricing, dict) or pricing.get("currency_unit") != "USD"
                    or any(pricing.get(key) != "0" for key in
                           ("completion", "image", "prompt", "request", "input_cache_reads", "input_cache_writes"))):
                raise WorkshopError("OVH no longer confirms this model is free; no image request was sent.", 503)
            request = urllib.request.Request(
                IMAGE_ENDPOINT,
                data=json.dumps({
                    "prompt": IMAGE_STYLE + theme["prompt"],
                    "negative_prompt": "text, letters, words, watermark, signature, map, diagram, "
                                       "photograph, photorealistic, blood, violence, nudity",
                }).encode(),
                headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json",
                         "Accept": "application/octet-stream"},
            )
            with self.opener.open(request, timeout=180) as response:
                if response.status != 200:
                    raise WorkshopError("OVH image generation did not complete.", 502)
                return response.read(10 * 1024 * 1024 + 1)
        except urllib.error.HTTPError as error:
            error.close()
            raise WorkshopError(
                f"OVH image service failed (HTTP {error.code}); no automatic retry or paid fallback.", 502,
            ) from None
        except (OSError, ValueError) as error:
            raise WorkshopError("OVH image service unavailable; no automatic retry or paid fallback.", 502) from error


class Workshop:
    def __init__(self, path, model=None, writer=None):
        self.path, self.model, self.writer = path, model, writer
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1):
                raise ValueError("Unsupported content workshop database version.")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS attempts (
                    id TEXT PRIMARY KEY, brief_id TEXT NOT NULL, brief TEXT NOT NULL,
                    model TEXT NOT NULL, prompt_version INTEGER NOT NULL,
                    status TEXT NOT NULL, created_at TEXT NOT NULL,
                    result TEXT, error TEXT, accepted_at TEXT
                );
                PRAGMA user_version=1;
            """)
        path.chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def view(row):
        return {
            "id": row["id"], "briefId": row["brief_id"], "brief": json.loads(row["brief"]),
            "model": row["model"], "promptVersion": row["prompt_version"],
            "status": row["status"], "createdAt": row["created_at"],
            "result": json.loads(row["result"]) if row["result"] is not None else None,
            "error": row["error"], "acceptedAt": row["accepted_at"],
        }

    def snapshot(self):
        with self.connect() as db:
            rows = db.execute("SELECT * FROM attempts ORDER BY rowid DESC").fetchall()
        return {
            "version": 1, "liveEnabled": self.writer is not None,
            "model": self.model, "limit": LIMIT, "used": len(rows), "remaining": max(0, LIMIT - len(rows)),
            "briefs": [{"id": key, **value} for key, value in BRIEFS.items()],
            "attempts": [self.view(row) for row in rows],
        }

    def generate(self, request_id, brief_id):
        try:
            if not isinstance(request_id, str) or str(uuid.UUID(request_id)) != request_id:
                raise ValueError("Non-canonical UUID.")
        except (ValueError, AttributeError) as error:
            raise WorkshopError("A canonical request UUID is required.") from error
        if not isinstance(brief_id, str) or brief_id not in BRIEFS:
            raise WorkshopError("Choose one of the workshop's fictional sample briefs.")
        brief = BRIEFS[brief_id]
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM attempts WHERE id=?", (request_id,)).fetchone()
            if previous:
                if previous["brief_id"] != brief_id:
                    raise WorkshopError("This request UUID belongs to a different brief.", 409)
                return self.view(previous)
            if self.writer is None:
                raise WorkshopError("Live generation is disabled. Configure a private OVH key, model and pricing approval.", 503)
            if db.execute("SELECT COUNT(*) FROM attempts").fetchone()[0] >= LIMIT:
                raise WorkshopError("The 20-request trial is exhausted. No provider call was made.", 429)
            db.execute(
                "INSERT INTO attempts(id,brief_id,brief,model,prompt_version,status,created_at) "
                "VALUES(?,?,?,?,?,'pending',?)",
                (request_id, brief_id, json.dumps(brief, ensure_ascii=False), self.model,
                 PROMPT_VERSION, datetime.now(timezone.utc).isoformat()),
            )
        # Reserve durably before any network I/O: ambiguous failures never free a paid attempt.
        try:
            result = validate_response(self.writer(brief))
        except WorkshopError as error:
            with self.connect() as db:
                db.execute("UPDATE attempts SET status='failed',error=? WHERE id=?", (str(error), request_id))
            raise
        with self.connect() as db:
            db.execute("UPDATE attempts SET status='draft',result=? WHERE id=?",
                       (json.dumps(result, ensure_ascii=False), request_id))
            return self.view(db.execute("SELECT * FROM attempts WHERE id=?", (request_id,)).fetchone())

    def accept(self, request_id, reviewed):
        if reviewed is not True or not isinstance(request_id, str):
            raise WorkshopError("Explicitly confirm factual and bilingual review before accepting.")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM attempts WHERE id=?", (request_id,)).fetchone()
            if row is None or row["status"] != "draft":
                raise WorkshopError("Only a completed draft can be accepted.", 409)
            if row["accepted_at"] is None:
                db.execute("UPDATE attempts SET accepted_at=? WHERE id=?",
                           (datetime.now(timezone.utc).isoformat(), request_id))
            return self.view(db.execute("SELECT * FROM attempts WHERE id=?", (request_id,)).fetchone())

    def export(self):
        return {
            "version": 1, "kind": "content-workshop-review", "fictionalSamplesOnly": True,
            "gameplayIntegration": False,
            "entries": [row for row in self.snapshot()["attempts"] if row["acceptedAt"] is not None],
        }


def make_handler(workshop):
    csrf = secrets.token_urlsafe(32)
    assets = {
        "/": ("content-workshop.html", "text/html; charset=utf-8"),
        "/content-workshop.mjs": ("content-workshop.mjs", "text/javascript; charset=utf-8"),
        "/content-workshop.css": ("content-workshop.css", "text/css; charset=utf-8"),
    }

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, body, content_type="application/json"):
            data = json.dumps(body, ensure_ascii=False).encode() if content_type == "application/json" else body
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; "
                             "connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(data)

        def admitted(self):
            hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            if self.headers.get("Host") not in hosts:
                self.reply(403, {"error": "The content workshop is loopback-only."})
                return False
            origin = self.headers.get("Origin")
            if (origin is not None and origin != "http://" + self.headers["Host"]
                    or self.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none")):
                self.reply(403, {"error": "Cross-origin workshop requests are not allowed."})
                return False
            return True

        def do_GET(self):
            if not self.admitted():
                return
            if self.path in assets:
                name, content_type = assets[self.path]
                return self.reply(200, (ROOT / name).read_bytes(), content_type)
            if self.path == "/api/workshop":
                return self.reply(200, {**workshop.snapshot(), "csrf": csrf})
            if self.path == "/api/export":
                return self.reply(200, workshop.export())
            self.reply(404, {"error": "Unknown workshop path."})

        def do_POST(self):
            if not self.admitted():
                return
            token = self.headers.get("X-Workshop-Token", "")
            if not token.isascii() or not secrets.compare_digest(token, csrf):
                return self.reply(403, {"error": "Refresh the workshop before making changes."})
            if self.path not in {"/api/generate", "/api/accept"}:
                return self.reply(404, {"error": "Unknown workshop operation."})
            if self.headers.get("Content-Type") != "application/json":
                return self.reply(415, {"error": "Workshop requests require application/json."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 1 <= length <= 2048 or self.headers.get("Transfer-Encoding"):
                    raise WorkshopError("Workshop requests require a body of 1 to 2048 bytes.", 413)
                self.connection.settimeout(10)
                body = self.rfile.read(length)
                if len(body) != length:
                    raise WorkshopError("Incomplete workshop request.")
                payload = json.loads(body)
                expected = {"id", "briefId"} if self.path == "/api/generate" else {"id", "reviewed"}
                if not isinstance(payload, dict) or set(payload) != expected:
                    raise WorkshopError("Invalid workshop fields; arbitrary prompts are not accepted.")
                if self.path == "/api/generate":
                    result = workshop.generate(payload["id"], payload["briefId"])
                else:
                    result = workshop.accept(payload["id"], payload["reviewed"])
                self.reply(200, result)
            except WorkshopError as error:
                logging.warning("Content workshop request rejected: %s", error)
                self.reply(error.status, {"error": str(error)})
            except (ValueError, UnicodeError):
                self.reply(400, {"error": "Invalid workshop JSON or request length."})
            except (OSError, sqlite3.Error):
                logging.exception("Content workshop storage or connection failure")
                self.reply(500, {"error": "Workshop unavailable; refresh to inspect the recorded attempt before generating again."})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--database", type=Path, default=ROOT / ".cache/content-factory/workshop.sqlite3")
    parser.add_argument("--enable-live", action="store_true")
    parser.add_argument("--pricing-reviewed", action="store_true")
    parser.add_argument("--model")
    parser.add_argument("--token-file", type=Path,
                        default=Path.home() / ".config/arcane-path/ovh-ai-endpoints-token")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    writer = None
    if args.enable_live:
        if not args.pricing_reviewed or not args.model or not re.fullmatch(r"[A-Za-z0-9._:/-]{1,160}", args.model):
            parser.error("Live calls require --pricing-reviewed and an exact catalogue --model.")
    elif args.model or args.pricing_reviewed:
        parser.error("Model/pricing flags require --enable-live.")
    if args.enable_live:
        try:
            token = private_file(args.token_file).strip()
        except (OSError, ValueError):
            parser.error("Cannot read private OVH key. Use a regular non-symlink token file with permissions 600.")
        if not token or not token.isascii() or any(char.isspace() for char in token):
            parser.error("The token file must contain one ASCII access key.")
        writer = OvhWriter(token, args.model)
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO)
    workshop = Workshop(args.database, model=args.model, writer=writer)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(workshop))
    print(f"Content workshop: http://127.0.0.1:{server.server_port}/ "
          f"({'LIVE: at most 20 recorded provider attempts' if writer else 'live generation DISABLED'})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
