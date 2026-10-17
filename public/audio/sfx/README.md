# Game sound files

27 original synthesized WAV files are included here, using the IDs from
[the sound-effect prompts](../../../audio-prompts/game-sounds.md), for example:

- `sfx-ui-confirm.wav`
- `sfx-step-road.wav`
- `sfx-meal.wav`
- `sfx-music-cue.wav`

Listen at `/public/audio/sfx/index.html` on the local game server using the
[audition page](./index.html). Each cue has its own player; playback is manual.

Generated directly with Python oscillators and seeded filtered noise, no
external service, samples, voices or backing music. Mono PCM16, 44.1 kHz,
short attack/release envelopes and headroom. The two `future-` cues are only
assets for later mechanics. Listen/tune at comfortable volume before release.

Reproduce from the repository root:

```sh
.venv/bin/python scripts/generate_sfx.py
```

Existing WAVs are protected: use `--overwrite` explicitly to regenerate them,
or `--output /path/to/new-directory` for an independent variation set.
No sound-effect playback is wired into the game yet.
