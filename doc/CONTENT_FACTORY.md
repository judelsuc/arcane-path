# Content workshop and optional live wording

## Future map tile-set generation (R-156, not implemented)

The factory should generate coherent tile sets for the optional map skins
(R-155), starting with small square pixel-art tiles matching the game's palette.
Terrain, roads, railways, built-up blocks and gameplay overlays must remain
readable. Generated art changes presentation only: both skins use the same map
data, scale and rules, with ASCII remaining available.

This is a future requirement, not an enabled generator or spending approval.
Generate a fresh coherent map tile set daily. Provider selection, daily
scheduling time and review/publishing workflow remain to be decided.

The original content-factory workshop generates English/French rumour and riddle
drafts on demand through **OVHcloud AI Endpoints**. It is a separate, local
writing tool, not a game feature. Only its three fixed fictional sample briefs
are submitted. No journey database, repository source, identities, notebooks,
private journal pages, coordinates or credentials enter the writing brief.

The model supplies expression, never authoritative facts, solutions, rewards,
interpretation permissions or gameplay outcomes. Each sample has an explicit
information ceiling and locked plain guidance. Drafts are not playable puzzles
and do not yet have a deterministic answer contract.

The separate [live game wording service](#live-game-wording-r-141) below now
supports ordinary travel introductions and fixed hospitality NPC dialogue.
It does not use workshop clue briefs, acceptances, or its 20-attempt counter.

## Daily shared start-page illustration (R-152)

One server-side job generates a shared title-screen illustration each real-world
day at **05:00 Europe/Paris**, including daylight-saving changes. A systemd timer
is used instead of a crontab so missed runs can be caught up after reboot.
This is independent of journey covers, notebook days and the paid text queue.

The prompt rotates seven imaginary European landscapes, all 22 tarot motifs
and the northern-hemisphere season in the same ink-and-watercolour style as
the journal. Only the server's calendar date selects the brief. No player,
journey, location, notes, private route or browser-supplied prompt is submitted.
The existing OVH SDXL adapter checks the model's zero pricing immediately
before every request and refuses paid substitution or unverifiable pricing.
No new provider is involved.

`start-art.sqlite3` lives beside the journey databases (0600). One attempt is
reserved durably per Paris date before network I/O, including manual runs.
Already published dates return without a call; failed or interrupted dates
cannot automatically retry. A successful, validated 1024-square image is
normalized to WebP and published in one SQLite transaction. The previous ready
image remains available while generating or after a failure, and old images
remain archived. Monitor disk growth; no automatic archive deletion is enabled.
Database/process errors are logged and the job exits nonzero; a killed job
retains its `running` record as an uncertain attempt, not a retry permission.

The browser only reads `/api/start-art` and `/api/start-art/image?day=YYYY-MM-DD`;
neither endpoint can generate images or accept prompts. Preview authentication
and GET-only nginx restrictions remain in force. All visitors see the same
published date. The title swaps out its authored ASCII art only after the
image loads, includes localized AI/model/date credit and a model-license link,
and retains an explicit localized notice if refresh/loading fails. Before the
first image, the existing title remains fully usable. Opening or returning to
the title reads current metadata; an already open game is not interrupted.

### Install on the existing VM

The runtime package includes both units. The existing private OVH key file
must be readable by `arcane`; its contents never belong in a unit or command.
`python3-pil`, `python3-yaml` and the system's Europe/Paris zoneinfo are required.
Install the reviewed runtime and nginx config before enabling the timer:

```sh
sudo install -m 0644 /opt/arcane-path/infra/systemd/arcane-start-art.service /etc/systemd/system/
sudo install -m 0644 /opt/arcane-path/infra/systemd/arcane-start-art.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/arcane-start-art.service /etc/systemd/system/arcane-start-art.timer
sudo systemctl daemon-reload
sudo systemctl enable --now arcane-start-art.timer
# Seed today's title once, without waiting for tomorrow's scheduled run:
sudo systemctl start arcane-start-art.service
sudo systemctl list-timers arcane-start-art.timer --no-pager
sudo journalctl -u arcane-start-art.service --no-pager -n 20
```

The oneshot has a five-minute process timeout, no restart policy, and the same
unprivileged/sandboxed writable directory as the game. A missed-run catch-up
and a manual seed cannot double-dispatch the same date. To disable future
generation, stop/disable the timer; the last published image remains readable.
Do not delete/reset failed records to retry without deliberately reviewing
the uncertain prior attempt. Back up this database with the other game caches.

Focused checks: `node --test tests/start-art.test.mjs` and
`.venv/bin/python -m unittest discover -s tests -p 'test_start_art.py'`.

### Deployment verification, 19 October 2026

The production-based runtime `1497e78c79ecf79d7e4af6d6fa366098802eb2a7`
includes the daily title job and gameplay-feedback fixes, without the
development lore/artifact systems. The Paris timer is enabled and the first
1024-square WebP was generated and verified through authenticated HTTPS.
The server's rejected old key was replaced with the working local key with
explicit user approval. One approved manual retry followed that HTTP 403;
the failed attempt database was privately backed up before the reset.
This does not enable automatic same-day retries.

The release passed 860 JavaScript and 213 Python tests; the development tree
passed 981 JavaScript and 248 Python tests. All 20 existing journey genesis
checksums were unchanged, all five persistent databases passed integrity
checks, and the cached notebook terrain endpoint now returns HTTP 200.
Live encounter wording and per-journey journal art remain opt-in services;
this timer does not enable their environment variables. Generated starting
backstories (R-151) remain pending, not part of this deployment.

## Opening backstory (R-151)

The registered `story.opening` brief uses the same authenticated, durable
single-worker wording queue as ordinary encounters. The server derives only
the saved parent name, departure motive, starting place, broad landscape,
birth card and starting season. It adds a random creative variation token,
not a journey identifier. Player names, private notes, route stages, witnesses,
future locations and canonical hidden facts are never submitted.

Opening stories use temperature **0.9**, at most 1400 completion tokens and
exactly two FR/EN strings of 500-1800 characters. Ordinary event introductions
use temperature **0.8**, at most 1400 completion tokens and three distinctly
worded FR/EN pairs (5-400 characters per string). Hospitality speech retains
temperature 0.5 and its 500-token limit. Variation is encouraged,
not guaranteed. The prompt permits domestic memories/emotional texture, not
new plot facts or clues; format checks cannot guarantee semantic fidelity.
Saved parent identity, motive and investigation never change.

The story is requested as soon as the genesis is available. After revealing
the birth card, a dedicated opening dialog appears **before gameplay**, not on
the title page. It shows authored backstory immediately and localized generation
status; a ready result can appear while that opening dialog is visible.
The player explicitly continues, without being forced to wait for a provider.
The trail guide offers rereading, including results that arrived later.
New zero-minute resumed journeys show the opening again before play; established
journeys can reread without a new generation. One immutable bilingual result
per journey/keeper is retained even across prompt-version changes. Failures,
reloads and reopening never retry a provider attempt.

The existing wording database receives an additive nullable `input` column;
old wording rows and accounting remain valid, with no genesis/save migration.
Enable with `ARCANE_LIVE_TEXT_TOKEN_FILE`, not the image timer's variable.
Photo-conditioned journal images and voices remain explicitly postponed.

The packaged `infra/systemd/arcane-path-content-factory.conf` is an explicit
opt-in drop-in for the existing VM. Install it as
`/etc/systemd/system/arcane-path.service.d/content-factory.conf`, then run
`systemctl daemon-reload` and restart the game service. It references the
existing private token file; it contains no credentials and enables text only.
Remove the drop-in and reload/restart to disable future text calls; retained
wording and the daily title image are not deleted.

## Live game wording (R-141)

The normal travel server optionally uses **only OVH AI Endpoints**
`Mistral-Small-3.2-24B-Instruct-2506` at the fixed HTTPS chat-completions endpoint.
The public `/v1/models` catalogue checked on **19 October 2026** lists USD
**0.00000010/input token**, **0.00000031/output token**, and **0/request**:
USD 0.10/million input tokens and USD 0.31/million output tokens. Prices may
change; this is neither an invoice nor a guaranteed euro/tax-inclusive price.
Paid calls have been authorized **without an aggregate/lifetime call cap**.
The manually operated workshop below still has its independent 20-attempt cap.
Donations are only a future funding idea; no donation/payment feature exists.

### Enable locally

Use the already private key file described below, never the key as a command
argument or browser value:

```sh
ARCANE_LIVE_TEXT_TOKEN_FILE="$HOME/.config/arcane-path/ovh-ai-endpoints-token" \
  .venv/bin/python scripts/travel_server.py --port 8766
```

Without `ARCANE_LIVE_TEXT_TOKEN_FILE`, no live text requests are sent. The
separate `ARCANE_JOURNAL_IMAGES_TOKEN_FILE` does **not** enable paid text.
The private-file loader refuses symlinks and group/world-readable files.
Enabling requires a server start under the intended environment; nothing
changes a running server, production configuration or deployment automatically.
For a future explicitly authorized VM setup, a systemd drop-in can set
`Environment=ARCANE_LIVE_TEXT_TOKEN_FILE=/etc/arcane-path/ovh-ai-endpoints-token`;
the `arcane` service user must be able to read that private regular file.
Do not put its contents in a unit, repository, Terraform or browser.
The checked-in nginx configuration explicitly permits the POST API and public
brief JSON, retaining the existing preview authentication and API rate limit.
These source changes have no effect on an already deployed proxy.

### Player experience and public boundary

- The browser asynchronously prefetches the **20 ordinary travel briefs**
  and **three hospitality lines** after a capability-backed journey becomes
  active. Disabled mode stops after the first status request, without a
  provider call. Legacy/local-only saves remain completely authored.
- An ordinary travel notice uses already-cached FR/EN prose when it opens;
  otherwise its existing authored introduction appears immediately. Its
  numerical effects, tarot cards, continue action and all game state remain
  authored. Late wording is available only for a subsequent encounter, not a
  mid-dialogue replacement. Language changes use the same bilingual snapshot.
- Three generated versions rotate per event kind. A presentation-only
  `wordingVariant` (0-2) is saved on each new event record, so redraw, language
  changes and resume retain that event's chosen version. Older events without
  this field use version zero. The status explicitly identifies generated
  wording/version versus the authored introduction; cache availability alone
  no longer implies generated text is visible in the open popup.
- The actual **sleep/shelter menu** displays public NPC greeting speech before
  asking for hospitality, then accepted/refused speech only after the normal
  action has settled. Settlement and mapped-worship hospitality are supported.
  Existing outcome explanations, disabled buttons, risks, time/cost notes and
  rewards are unchanged. Interrupted actions get no invented NPC response.
  Opening/reopening the menu never performs the hospitality action.
- Authored source wording always remains in the project. One immutable
  bilingual set is cached per journal owner, canonical brief and content/
  prompt version (three event introductions, one hospitality line). Repeated
  encounters rotate that cached set; this is not
  a fresh generation on every step or unrestricted conversational chat.
  The event-only `-variants-1` revision preserves historical cache rows.
  It requests one new set per event brief/owner on demand, never overwriting
  saved opening stories or refreshing unchanged hospitality text.
- The provider receives **only** one entry from
  `public/narrative-briefs.json`, never the request body or client game state.
  The API accepts only a registered identifier plus journey/optional keeper;
  it uses the journal capability header for authentication and owner binding.
  Names, notes, coordinates, saves, journal pages, source/private data, lore
  hints, clues and evidence permissions never enter provider prompts.
  Story-only encounters and dog adoption are outside this registry.
- Prompts ask for conservative facts-only wording without additional offers,
  reasons, clues or consequences. JSON-schema/character checks **do not prove
  semantic correctness or translation equivalence**. Imperfect model wording
  remains possible and is decorative, never an outcome or new permission.
  Rendered wording uses `textContent`, not HTML.

### Durability, accounting and operational bounds

`live-narrative.sqlite3` lives beside the persistent journey database and is
private (0600), separate from the workshop and art databases. Back up that
directory together with journeys. Each owner/brief/version has one durable
record. Repeated requests/tabs and restarts cannot double-dispatch it in the
supported single-server process. Queued records resume after restart; a record
already marked running is failed with unknown billing, **never retried**.
Old-version queued briefs are failed without sending obsolete content.

There is no aggregate call budget or donation gate. One worker dispatches at
most one provider call at a time; at most 32 queued/running records are accepted
globally. A full queue returns an explicit 503 and retains authored text.
HTTP requests are limited to 4096 bytes; provider inputs are fixed short public
entries. Hospitality calls request at most 500 completion tokens; event sets
and opening stories request at most 1400. Each call has a
45-second network timeout, refuses redirects, and reads at most 64 KiB.
Accepted ordinary output is one bounded FR/EN pair (5-400 characters each),
plus exactly two distinct bilingual alternatives for event introductions.
These are per-call bounds, not a guaranteed monetary ceiling or exact
wall-clock cancellation of a slow streaming socket.

Dispatch is counted durably before network I/O, including failed/uncertain
calls. Valid reported input/output usage is retained even if prose validation
fails. Missing/unreadable usage is counted as unknown rather than zero.
The owner-authenticated API includes attempt totals, prompt/completion tokens
and unknown-usage attempts; provider attempt/completion/failure logs include
the public brief/model and token counts, never the key or game state.
OVH billing remains authoritative. Cache/database retention is not capped;
monitor disk size and actual spend if this grows beyond one player.

Localized in-game statuses distinguish pending, cached, disabled, local-only
and failure; network/provider failures also go to browser/server logs.
Polling reads the same durable record and **does not retry generation**.
A failed request is not silently retried even when reopening an encounter;
operators must deliberately review/reset records if they ever want another
attempt. No automatic provider fallback exists.

Focused verification:

```sh
mkdir -p .cache/test-tmp
TMPDIR="$PWD/.cache/test-tmp" .venv/bin/python -m unittest discover -s tests -p 'test_live_narrative.py'
node --test tests/live-narrative.test.mjs tests/journey-events-ui.test.mjs tests/economy-ui.test.mjs
```

One isolated fictional live smoke call on 19 October 2026 completed in both
languages, with 164 reported input and 86 output tokens (about USD 0.00004306
at the dated rates above). Its private cache/accounting is separate from real
journeys. That sample added an unprovided street texture and facial detail:
this is concrete evidence of the semantic limitation, not validation of
fact fidelity. The prompt was subsequently tightened to minimal paraphrasing;
no second paid call or automatic retry was made.

## OVH setup

AI Endpoints is serverless: do not provision a GPU VM or an AI Deploy workload.
The existing OpenStack Terraform configuration does not create an AI Endpoints
key. At this checkpoint, the official OVH Terraform provider has no native
AI Endpoints resource; no shell provisioner or credentials in Terraform state
are introduced.

1. In the OVHcloud console, open your Public Cloud project, then
   **AI & Machine Learning > AI Endpoints**.
2. Create an access key, preferably with a short expiry. Consult the official
   [getting-started guide](https://github.com/ovh/docs/blob/develop/pages/public_cloud/ai_machine_learning/endpoints_guide_01_getting_started/guide.en-gb.md)
   for account/project sharing restrictions.
3. Choose a text model with JSON-schema structured-output support from the
   [current catalogue](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/).
   Check its current input/output token prices in the OVH console before calls.
   Model names, availability and prices change; none is silently defaulted.
4. Save the key outside the repository. Do not paste it in chat, a command-line
   argument, a browser field or a Terraform variable.

Run this locally; the prompt is hidden and the key is not in shell history:

```sh
mkdir -p ~/.config/arcane-path
(
  umask 077
  python3 -c 'import getpass; from pathlib import Path; p = Path.home() / ".config/arcane-path/ovh-ai-endpoints-token"; p.write_text(getpass.getpass("OVH AI key (hidden): ") + "\n"); p.chmod(0o600)'
)
```

The server reads a regular, non-symlink private file and checks its permissions.
The key is used only for the Authorization header to the fixed OVH HTTPS API.
It is never returned to the browser, stored in draft records or logged.
Redirects are refused rather than forwarding credentials to a different host.

## Start the workshop

From the repository root, start in inspection mode without reading a key or
making provider calls:

```sh
.venv/bin/python scripts/content_factory.py
```

Open **http://127.0.0.1:8767/**. The page explicitly shows live generation disabled.
The game server and its saves are untouched.

After reviewing the chosen model's price and structured-output support:

```sh
.venv/bin/python scripts/content_factory.py \
  --enable-live --pricing-reviewed --model 'EXACT_MODEL_NAME_FROM_OVH'
```

For the initial trial, the public
[models endpoint](https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models)
listed `Mistral-Small-3.2-24B-Instruct-2506` on 19 October 2026 at USD 0.10
per million input tokens and USD 0.31 per million output tokens. This is a dated
catalogue observation, not a guaranteed euro invoice, tax-inclusive price or
permanent model recommendation.

Stop the inspection process before restarting on the same port. An optional
`--port` chooses a different loopback port. `--token-file` accepts a private key
file path, not the key itself. No automatic provider call occurs at startup.

1. Select the artifact-town, parent-direction or journal-notice sample.
2. Read the exact permitted facts and constraints.
3. Click **Generate live drafts**. One manually triggered provider request
   produces one rumour and one riddle in each language.
4. Compare both languages against the original facts. Check uncertainty,
   additional locations, invented mechanics and accidental plain guidance.
5. Confirm review and **Accept locally** only if suitable.
6. Download the accepted sample pack. Reloading or restarting preserves drafts,
   acceptances, token accounting and the trial counter.

Acceptance is editorial, not proof of semantic correctness. Structured output
and local validation enforce format and text bounds, not truth or translation
equivalence. Rejected formats are errors, not successful content. Accepted
sample packs remain outside game discovery, authority and release content.

## Request and cost controls

- Exactly **20 reserved provider attempts per persistent workshop database**,
  including failures. This is a trial allowance, not a daily reset.
- A request is reserved atomically before network access. Concurrent requests,
  browser tabs and process restarts cannot exceed the allowance.
- One UUID identifies each request. Replaying it returns its recorded status;
  it never makes another provider call. An uncertain interrupted request stays
  reserved and is displayed as pending/unknown.
- No automatic retries, polling generation, background calls or startup calls.
- Each provider request has a 45-second timeout, a 1,200-output-token request
  limit and a 64 KiB response limit. OVH failures and incomplete/invalid output
  are explicitly displayed. Unknown outcomes may still have been billed.
- Returned input/output token usage is retained when provided; missing usage
  is explicitly unknown. The app does not calculate a euro bill or claim a
  guaranteed monetary cap. Review actual billing in OVH.
- Drafts and the allowance are in `.cache/content-factory/workshop.sqlite3`
  (private permissions, ignored by Git). Back up this database if needed.
  A different or deleted database has its own allowance; there is no reset
  button or HTTP endpoint. Recreating it is not an OVH account-wide cost limit.
- The server binds only to `127.0.0.1`, checks Host and Origin, uses a
  per-process request token and exposes only its own page, assets and APIs.
  Do not tunnel it publicly. No main-server or nginx route is added.

## Personalized journal illustrations

**Later R-139 refinement (not implemented):** ask the player to choose a
game-offered photograph of the current location before cover/day generation.
The cover uses the birth card; a daily page uses that day's card and photographs
from the end-of-day location. Skipping uses tarot plus recorded events and
earned discoveries. This supersedes the prototype's automatic enqueue below.
The verified OVH SDXL API is text-to-image only; photo conditioning requires
a separately verified provider capability, licence checks and explicit external
processing consent. The existing prototype must not be represented as this
photo-based flow.

### Reference-photo feasibility for R-139

The public [OVH API specification](https://oai.endpoints.kepler.ai.cloud.ovh.net/openapi.json)
exposes `/api/{id}/text2image` and `/v1/images/generations`, but no image-edit
route. `SDXLHttpRequest` accepts only `prompt` and `negative_prompt`; the
OpenAI-compatible generation schema also has no reference-image input. Generic
OpenAI model names in schema descriptions do not prove those models are offered.
The existing free endpoint cannot implement the confirmed photo-base flow.

Two genuine image-to-image approaches are available in principle:

- Run an SDXL image-to-image pipeline using
  [Diffusers](https://huggingface.co/docs/diffusers/en/using-diffusers/img2img),
  on local hardware or separately provisioned compute. Open model availability
  does not make hosted compute free; GPU suitability and operating costs remain
  unverified. OVH AI Deploy is a separate deployment product, not the free
  managed SDXL endpoint.
- Use a separately approved image-to-image service. As one verified candidate,
  [fal FLUX.1 dev image-to-image](https://fal.ai/models/fal-ai/flux/dev/image-to-image)
  documents an input image plus prompt and transformation strength, with
  commercial use included in the service. Its listed price is USD 0.03 per
  megapixel, rounded up to whole megapixels: a 1024 x 1024 output is
  1.048576 MP and therefore USD 0.06 under that rule. This is a public-price
  estimate, not a measured invoice; taxes, currency conversion, retries and any
  other fees are excluded. Verify the billing basis before enabling calls.
  Source-photograph licences and provider retention/processing terms still
  require review.

The user authorized investigation only, with confirmation before extra cost.
No new provider account, compute resource, image upload or paid request has been
authorized or created. Neither alternative is implemented; no paid fallback
has been added.
After reviewing these options, the user explicitly postponed photo-based
generation. Keep R-139 recorded for a later increment; do not provision a
provider or start a paid trial.

### Backup idea: local Wikipedia context (R-140, not implemented)

The local Wikipedia description could supply the setting for the existing
text-to-image endpoint without requiring image-to-image support. Extract a
small, bounded set of visual facts (landscape, architecture, landmarks) into
an original brief, then combine it with the birth card for the permanent cover
or the day's card, recorded events and earned discoveries for a daily image.
Do not copy article passages or submit full articles. Retrieved text is
untrusted source material, not instructions; it must not introduce hidden game
facts, unlock clues or invent journey events.

For example, an original setting brief describing stone houses beside a river
could be combined with Temperance's flowing-water motif, in the established
ink-and-watercolor style. The result should be labelled a symbolic illustration
inspired by local context, not a faithful view or a transformed photograph.
Retain the article URL and attribution, review licence obligations, and use
the tarot/events-only option with a visible context-unavailable status when
no suitable description exists.

This is a recorded proposal, not enabled behavior. A specific article's
landmarks may identify an in-game location; review and communicate that change
before relaxing the prototype's coarse-location-only provider boundary.
No photo upload or additional image provider is needed in principle. Keep
the existing zero-price check; free availability is not guaranteed.

**Manual feasibility test, 19 October:** one explicitly requested live OVH
generation succeeded after the existing adapter verified zero catalogue prices.
The input was an original visual brief distilled from the public
[Annecy Wikipedia introduction](https://en.wikipedia.org/wiki/Annecy)
(old town, canals/river, lake and mountains), plus Temperance's two-cup water
motif. No photo, article prose, player location or journey data was submitted.
The response was decoded and saved as metadata-stripped 1024 x 1024 WebP:
213,886 bytes, 9.68 seconds including catalogue verification and normalization.
One image-generation request was made, with no provider retry.

Visual inspection showed a convincing canal-town ink/watercolor scene, but
also limitations: the model drew a notebook as an object rather than flat cover
art, the lake/mountains were not clearly expressed, and the requested transfer
of water between the cups was not apparent. This supports the fallback's basic
feasibility, not faithful geography or reliable card symbolism. The prompt and
sample are retained outside the repository as trial evidence; no automatic
Wikipedia extraction or game integration has been implemented.

The game now has an opt-in, independent background image queue:

- One **permanent cover per journey**, composed from birth/day tarot motifs
  and coarse surroundings when first observed.
- One additional illustrated memory page for each completed **in-game UTC
  calendar day**. These do not replace the cover.
- Daily observations contain only known activity categories and broad scenery.
  They are not a reconstructed timeline. Existing journeys start with partial
  observation; no images or invented activity are backfilled for unseen days.
  Actions spanning midnight contribute continuous walking/sleep motifs to
  touched days; completed meal/work counters belong to their observation day.
- The current main journey is browser-simulated. Its activity tags are
  client-observed decoration, not server-authoritative proof that an event
  happened. Images never grant clues, unlock guidance, change rewards or
  illustrate hidden journal contents.
- Only fixed symbolic phrases derived from enum-validated tags go to OVH.
  Names, capabilities, journey IDs, dates, exact locations, journal notes and
  saves never enter the image prompt.
- The authenticated server queues immediately and runs one generator in the
  background, even after the browser closes. The browser retrieves finished
  images and saves them to its scoped notebook when it returns. A cover remains
  fixed across subsequent syncs, day changes, reloads and server restarts.
- Completed days appear as dated ordinary notebook entries with editable notes.
  The cover appears on the title page and PDF cover. Generated images retain
  AI attribution and model licence links; notebook snapshots preserve them.

The fixed model is OVH's Stable Diffusion XL service. Before **each image
request**, the worker checks the public model catalogue still lists zero
prompt, completion, image, request and cache charges. If this cannot be
confirmed, generation fails explicitly. It never switches to a paid model.
The output is decoded, required to be a 1024 x 1024 JPEG/PNG and re-encoded as
WebP without source metadata. A 10 MiB upstream size bound and 180-second
generation timeout apply. Its licence is
[CreativeML Open RAIL++-M](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md);
free access does not remove licence conditions or guarantee future availability.

The queue and images are stored privately in the travel cache's
`journal-art.sqlite3`. Each (owner, cover/day) key is immutable and deduplicated.
Generation failures are visible and not automatically retried; interrupted
in-flight jobs become explicit failures on restart, while queued jobs resume.
An operator must investigate failed jobs rather than regenerate indefinitely.
The initial bounds are 32 queued/running jobs globally, 1,000 total images and
366 per journey (cover plus at most 365 days). This is bounded first-year
support, not an unlimited asset service. Queue-full errors retain client
observations for a later sync. Image selection is personalized, not a promise
that every requested visual motif is faithfully rendered.

### Enable locally or on the VM

Install the declared Python dependencies before starting the updated server:

```sh
.venv/bin/python -m pip install -r requirements.txt
ARCANE_JOURNAL_IMAGES_TOKEN_FILE="$HOME/.config/arcane-path/ovh-ai-endpoints-token" \
  .venv/bin/python scripts/travel_server.py --port 8766
```

Without that environment variable the API reports images disabled, makes no
provider calls and preserves the normal journal. This is separate from the
text workshop on port 8767. Do not stop another user's existing server to
change its configuration.

On the OVH VM, the system service runs as `arcane` with `ProtectHome=true`.
Use `/etc/arcane-path/ovh-ai-endpoints-token`, owned by `arcane`, mode 600, in
a root-owned directory with group `arcane`, mode 750. Do not put this secret
under a home directory, in Terraform state or in cloud-init.

Run these **once** after SSH login; the `install` command replaces any existing
key file. Only enter the key at the hidden prompt:

```sh
sudo install -d -o root -g arcane -m 0750 /etc/arcane-path
sudo install -o arcane -g arcane -m 0600 /dev/null /etc/arcane-path/ovh-ai-endpoints-token
sudo -u arcane python3 -c 'import getpass; from pathlib import Path; Path("/etc/arcane-path/ovh-ai-endpoints-token").write_text(getpass.getpass("OVH AI key (hidden): ") + "\n")'
sudo systemctl edit arcane-path.service
```

The systemd override contains only:

```ini
[Service]
Environment=ARCANE_JOURNAL_IMAGES_TOKEN_FILE=/etc/arcane-path/ovh-ai-endpoints-token
```

Then `sudo systemctl daemon-reload`. A shell `export` in an SSH session does
not configure the system service. **Do not restart production until the
updated release is separately approved and deployed.** Existing Ubuntu VMs
also need `python3-pil`; new cloud-init configurations include it.

The nginx route permits only authenticated POST requests. Capabilities are
headers, never URL query parameters. Image bytes can only be fetched by the
corresponding notebook owner; they are not a public static image collection.

**Real provider check:** an isolated fictional journey produced a cover in
9.70 seconds (206,016-byte WebP) and a daily illustration in 15.37 seconds
(152,580-byte WebP). Both decoded as 1024 x 1024 images. Temporary fixture
identities/databases were removed, and no player save was modified. These
measurements are examples, not a latency guarantee.

### Dream text and future voice support

Dream text already uses authored FR/EN templates, tarot motifs and permitted
discovery evidence in the authoritative playtest. It is not yet live LLM
dream narration, nor fully migrated to the ordinary journey. The text workshop
currently generates rumour/riddle samples only.

NPC voice generation needs text-to-speech; Whisper is speech-to-text.
Potential future voice assets should derive from already-approved dialogue,
retain their information ceiling and use fictional voices. French model
availability, pricing and licences need verification before implementation.
No voice generation is implemented by this increment.

## Text workshop verification and next slice

Run focused tests:

```sh
PYTHONPATH=scripts:tests .venv/bin/python -m unittest test_content_factory
node --test tests/content-workshop.test.mjs
```

Tests use explicit provider fixtures, never a real key or paid call. They cover
the persistent concurrent allowance, UUID replay, interruption, explicit
acceptance/export, structured responses, token accounting, provider failures,
fixed OVH routing and local HTTP admission. A fixture-backed browser check is
not evidence that a real OVH model has generated content.

**Initial live check, 19 October 2026:** one manually triggered real request to
`Mistral-Small-3.2-24B-Instruct-2506` returned valid English/French rumour and
riddle drafts, with 252 input and 238 output tokens reported. The rendered page
showed 1/20 attempts used and 19 remaining, unchanged after reload. The draft
was deliberately left unaccepted: some wording implies more certainty than
the supplied past observation. This verifies live connectivity and persistence,
not production narrative quality or semantic correctness. No game content was
published. The focused 14-test Python workshop suite, packaging regression and
two JavaScript display tests pass.

Next, after a successful live model trial and editorial review: add approved
fact-bundle adapters from the authoritative playtest, generation revision
checks, deterministic puzzle answer contracts and reviewed pack consumption.
Do not connect arbitrary browser-supplied prompts or client-provided evidence
to a paid endpoint.

Official references:

- [OVH structured output and OpenAI-compatible endpoint](https://github.com/ovh/docs/blob/develop/pages/public_cloud/ai_machine_learning/endpoints_guide_05_structured_output/guide.en-gb.md)
- [OVH billing and model lifecycle](https://github.com/ovh/docs/blob/develop/pages/public_cloud/ai_machine_learning/endpoints_guide_04_billing_concept/guide.en-gb.md)
- [OVH Terraform provider resources](https://github.com/ovh/terraform-provider-ovh/tree/master/docs/resources)
