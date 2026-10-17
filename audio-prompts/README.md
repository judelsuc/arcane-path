# Audio generation prompts

Original prompts for **Les Arcanes du Chemin**. Music is intended for Suno;
sound-effect prompts can also be used in a dedicated SFX generator.
These are production briefs, not generated audio or runtime integration.

Download generated tracks into [public/audio/music/](../public/audio/music/),
and individual sound effects into [public/audio/sfx/](../public/audio/sfx/).
Use the prompt IDs as filenames (for example, `music-road-day.wav`).

## Files

- [Soundtracks](./soundtracks.md): instrumental 8-bit music, including the
  street-music exercise and optional future events/dungeons.
- [Game sounds](./game-sounds.md): short, isolated interface/gameplay cues.

## Shared identity

A contemporary walking fairy tale: curious, tender, slightly melancholy,
with restrained mystery and small hopeful discoveries. Sparse 8-bit timbres:
pulse melody, triangle bass, quiet noise percussion, occasional arpeggios.
Leave room for reading; no wall of sound or piercing lead.

The original recurring motif is **D–F–A–E**: four unhurried notes, sometimes
fragmented or transposed. It represents the road and the parent trail.
It is a suggestion, not a guarantee that the generator will follow notation.
Do not request existing game themes, named artists, sampled recordings or
recognizable melodies from other works.

## Generating music

1. Enable **Instrumental** in Suno. Paste one track's prompt in the style/
   description field. Leave lyrics empty; do not paste headings as lyrics.
2. Generate several variations. Keep a coherent sound palette across tracks.
3. Prefer restrained dynamics and a clean beginning/end. The prompts request
   loop-friendly phrasing, but generated audio is **not guaranteed seamless**:
   edit/crop at matching bars, remove silence and audition repeated playback.
4. Keep a full-resolution master. Suggested delivery: WAV, 44.1 or 48 kHz.
   Stereo is fine for music; export lightweight web versions separately.
5. Match perceived loudness across tracks; leave headroom. Do not normalize
   every small cue into a loud transient. Listen at comfortable volume.

Names beginning `future-` are reserved for later mechanics. Generating them
does not mean those mechanics exist. The game currently has no audio loader,
mixer, music playback or sound settings; these prompts do not enable sound.

## Generating sound effects

Suno is primarily a music generator: it may turn a sound-effect prompt into
a song, repeat a cue, or add unwanted accompaniment. Try isolated SFX prompts,
but use a dedicated SFX generator or synth editor when a precise one-shot
is needed. Cut out a clean single event and trim its silence manually.

Suggested delivery: mono WAV, 44.1 or 48 kHz, with a short de-click envelope.
Keep the requested duration as a target, not a promise of exact synthesis.
Do not generate one long track containing all cues.

## Rhythm-game timing

The current street-music game has **8 beats spaced 700 ms apart**, a 1500 ms
preparation period, and a +/-180 ms input window. A matching tempo is
**60000 / 700 = 85.7142857 BPM**.

Do not assume Suno obeys this accurately. A generated music bed must be
quantized/time-stretched and aligned offline, or be used only as inspiration.
For reliable input timing, synthesize or place the beat cues on the game's
clock. Keep the 1500 ms preparation outside the beat loop. Do not bake success
or failure sounds into the accompaniment.

## Suggested asset names and provenance

Use the IDs in the catalogs, for example `music-road-day.wav` and
`sfx-step-grass.wav`. Keep generated files outside Git until their size,
licensing and delivery format have been reviewed.

For each selected asset retain: prompt ID, exact prompt/version, generation
date, service/model version, account/plan rights at generation time, chosen
variant and any editing notes. Check the service's current usage terms before
distribution; a prompt alone does not establish rights to generated output.
