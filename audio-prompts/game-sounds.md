# 8-bit game-sound prompts

Generate **one cue at a time**, without a music bed. Suno may not produce
precise one-shots; use a dedicated SFX generator/synth editor when necessary.
Every duration below is an editing target. Suggested master: mono WAV.
These are prompts only; none is connected to game events yet.

First-version cues have now been synthesized locally, without Suno or any
backing music: [WAV files and audition page](../public/audio/sfx/index.html).
The briefs below remain the design reference; reproduce the assets with
`scripts/generate_sfx.py`. They are not yet connected to gameplay events.

## Shared suffix

Append this to any prompt if the generator adds accompaniment:

```text
One isolated original 8-bit synthesized sound effect only. No music bed,
drum loop, melody continuation, vocals, speech, realistic recording, background
noise, repetition or long reverb. Soft attack and short clean tail, no clipping
or piercing high frequencies. Leave a little headroom.
```

## Interface

### sfx-ui-focus - Menu focus - 60-100 ms

```text
A tiny soft 8-bit pulse-wave tick, one rounded mid-register note, about
80 milliseconds. Quiet and neutral for moving through a text menu.
One isolated cue, no accompaniment, repetition, voice or long tail.
```

### sfx-ui-confirm - Confirm - 120-180 ms

```text
Two soft 8-bit pulse notes rising by a small interval, a compact friendly
confirmation, about 150 milliseconds total. Restrained volume, clean tail,
one isolated effect, no jingle continuation, music, voice or repetition.
```

### sfx-ui-back - Close or cancel - 100-160 ms

```text
Two short rounded triangle-wave notes gently descending, about 130 milliseconds
total, quiet and nonjudgmental. A menu-back cue, not a failure sound.
One isolated effect, no accompaniment, speech or repeat.
```

### sfx-action-unavailable - Rejected action - 150-220 ms

```text
A soft double 8-bit pulse at the same low-mid pitch, a little muted,
about 180 milliseconds total. Communicate “not available” without a harsh
buzzer or alarm. One isolated sound, no music, voice or repetition.
```

### sfx-look-toggle - Observation cursor - 100-160 ms

```text
A delicate 8-bit upward triangle blip with a very short pulse answer,
about 130 milliseconds, suggesting attention and curiosity. Quiet,
lightweight, one isolated cue, no sweeping sci-fi laser, music or voice.
```

### sfx-photo-open - Photo/content opened - 120-200 ms

```text
A tiny original 8-bit shimmer: two soft pulse notes and a brief triangle
sparkle, around 170 milliseconds. A gentle visual discovery cue, not a
real camera shutter. One isolated effect, no music, voice or repetition.
```

Do not play a cue for every network request, cache hit or downloaded photo.
Content arrives progressively; repetitive loading sounds would overwhelm play.

## Movement

Use one subtle cue per completed player step, not a continuous footstep loop.
These are interface abstractions for 250 m movement, not literal walking speed.

### sfx-step-road - Road - 70-120 ms

```text
One quiet 8-bit footstep abstraction: a short filtered-noise tick with a
rounded low triangle knock, about 90 milliseconds. Dry and light,
no realistic shoe recording, rhythm loop, music, voice or repeat.
```

### sfx-step-grass - Grass/fields - 90-140 ms

```text
One soft 8-bit grass-step abstraction, a very short low-pass noise brush
with a faint low triangle tap, about 120 milliseconds. Gentle, dry and
subtle, no realistic foliage recording, music, voice or repeat.
```

### sfx-step-forest - Forest - 90-150 ms

```text
One restrained 8-bit forest-step cue: two closely spaced muted noise grains
and a small low pulse tap, about 130 milliseconds. Slightly textured but
not a loud branch snap. No realistic recording, music, voice or loop.
```

### sfx-step-stone - Hill/mountain - 80-140 ms

```text
One small original 8-bit stone-step abstraction: a muted triangle tick
and a brief grainy noise tail, about 110 milliseconds. Firm but not metallic,
harsh or loud. No realistic rock recording, music, voice or repetition.
```

### sfx-step-water - Water-cell traversal - 100-160 ms

```text
One gentle 8-bit watery blip, a rounded low pulse bending slightly upward
with a tiny filtered-noise splash, about 140 milliseconds. Abstract map
feedback, not realistic swimming. No music, voice, long tail or loop.
```

The current map allows water traversal; this cue must not imply a future
swimming mechanic or a real-world safe crossing.

## Town, food and money

### sfx-town-enter - Settlement entry - 300-500 ms

```text
A modest welcoming 8-bit three-note phrase on soft pulse and triangle,
around 400 milliseconds. Warm everyday arrival, not a grand fanfare.
Original melody, one isolated cue, no music bed, bells recording or speech.
```

### sfx-coins-earned - Earnings - 180-300 ms

```text
Three tiny rounded 8-bit triangle pings rising gently, about 240 milliseconds.
A modest pocket-money reward, no casino sound or jackpot flourish.
One isolated cue, no realistic coins, music bed, speech or repeat.
```

### sfx-purchase - Purchase completed - 140-220 ms

```text
A soft 8-bit low-mid pulse tick followed by one stable triangle note,
about 180 milliseconds. Calm purchase confirmation, not a cash-register
recording. One isolated cue, no music, voice or repetition.
```

### sfx-meal - Meal consumed - 250-400 ms

```text
A warm original 8-bit rising two-note triangle phrase with a soft pulse
chord answer, around 320 milliseconds. Small relief and restored energy.
No chewing, eating or stomach recordings, no music bed, voice or repeat.
```

### sfx-shelter - Shelter found/protected sleep - 450-700 ms

```text
A gentle original 8-bit three-note descending phrase resolving into a
warm consonant chord, around 600 milliseconds. A safe pause on a journey.
Soft triangle and pulse voices only, no door recording, snoring, music
continuation, voice or long reverberation.
```

### sfx-wake - Sleep action completed - 250-400 ms

```text
A quiet 8-bit triangle note followed by two soft ascending pulse notes,
around 330 milliseconds. Clear-headed awakening, restrained and tender.
Not an alarm clock. One isolated cue, no birds recording, music or speech.
```

## Needs and story

### sfx-needs-warning - Threshold warning - 250-400 ms

```text
Two soft separated 8-bit low-mid pulse notes with a gentle downward bend,
about 320 milliseconds total. A compassionate attention cue for hunger,
fatigue or sleep pressure, not panic. No harsh buzzer, siren, heartbeat
recording, music bed, voice or repeat.
```

Use only when entering a warning state, not on every UI refresh or step.

### sfx-tarot-draw - Card revealed - 350-550 ms

```text
An original delicate 8-bit arpeggio, four soft triangle/pulse notes moving
upward then settling, about 450 milliseconds. Curious magical realism,
like finding a mark in a journal, not occult horror. One isolated cue,
no card recording, whisper, choir, music bed or long reverb.
```

### sfx-clue-found - Witness clue recorded - 400-650 ms

```text
An original 8-bit D-F-A-E four-note motif played gently on a soft pulse lead
with a quiet triangle answer, about 550 milliseconds. Recognition and hope,
small discovery rather than treasure fanfare. One isolated cue, no music bed,
speech, crowd, existing theme or repetition.
```

### sfx-reunion - Objective achieved - 700-1100 ms

```text
A tender original 8-bit rising phrase resolving into a warm major chord,
around 900 milliseconds. Relief at finding family, intimate rather than
triumphant. Soft pulse melody and triangle support, no loud percussion,
voice, realistic crying, music continuation or borrowed melody.
```

### sfx-journey-ended - Exhaustion outcome - 450-750 ms

```text
A quiet original 8-bit descending triangle phrase ending on a gentle
suspended chord, about 650 milliseconds. The attempt has ended, but hope
remains. No death sound, scream, harsh failure buzzer, dramatic impact,
voice, music bed or repetition.
```

## Street-music minigame

### sfx-music-cue - Scheduled beat - 40-80 ms

```text
One precise soft 8-bit pulse click at a comfortable mid pitch, about
60 milliseconds, dry attack and clean short release. A clear rhythm-game
timing marker, no swing, echo, extra notes, music, voice or repetition.
```

### sfx-music-hit - Successful note - 70-120 ms

```text
One pleasant rounded 8-bit pulse note with a tiny triangle harmonic,
around 90 milliseconds. Immediate restrained feedback for a correctly timed
tap. No delay, echo, multi-note flourish, music bed, voice or repetition.
```

### sfx-music-miss - Missed note - 60-100 ms

```text
One very quiet muted 8-bit noise tick, around 80 milliseconds, neutral
rather than punishing. Short and unobtrusive so it never hides the next beat.
No buzzer, low boom, music, voice, echo or repeat.
```

For timing, use a trimmed cue scheduled by the game clock; do not trust a
generated phrase to contain precisely spaced markers. Consider changing the
hit note's pitch in code later instead of generating a separate cue per pitch.

## Future mechanics only

### future-sfx-hidden-entrance - Fictional dungeon discovered - 600-900 ms

```text
An original 8-bit hollow triangle note answered by a soft rising pulse
arpeggio, about 750 milliseconds. An intriguing hidden doorway in a fictional
world, curious not frightening. No real lock, explosion, voice, whisper,
music bed, existing theme or jump scare.
```

### future-sfx-night-event - An encounter begins - 350-550 ms

```text
One restrained original 8-bit suspended two-note chord followed by a soft
triangle question, around 450 milliseconds. Alert curiosity on a night road,
not a danger alarm. No scream, violent impact, siren, harsh transient, music,
speech or repetition.
```
