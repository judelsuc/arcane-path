# Music files

Download generated music here, using the IDs from
[the soundtrack prompts](../../../audio-prompts/soundtracks.md), for example:

- `music-title.wav`
- `music-road-day.wav`
- `music-town.wav`
- `music-night.wav`
- `music-street-practice.wav`
- `music-reunion.wav`

WAV is preferred for editing; MP3 is fine if WAV is unavailable.
Keep full-length originals until loop points have been edited and verified.
Click **Enable music** in the game (off on each page load). Tracks loop at
25% volume by default; use the volume slider or mute button at any time.
The player accepts WAV, MP3 or OGG, with canonical or numbered prompt names:
`music-title.wav`, `01-music-title.wav` and `01 - music-title.wav` all work.
Tracks 06 and 07 are now generic `music-city` and `music-coast`, usable
throughout Europe. Existing `music-paris` and `music-tahiti` filenames (with
or without numbering) remain accepted; no need to regenerate or rename them.
Do not keep multiple versions unless you want the first matching one used:
WAV before MP3 before OGG, canonical before compact/spaced numbered names.

Missing/context-specific tracks fall back to `music-road-day`, then
`music-title`, then silence. The status explains any fallback; the console
records file/decode errors. Re-enable music after downloading a missing file
to retry files marked unavailable in this session.

Music pauses in hidden tabs and throughout the rhythm-game dialog; generated
practice audio is not used as a timing source. New context tracks restart
from the beginning, with no crossfade or custom loop-point editing yet.
