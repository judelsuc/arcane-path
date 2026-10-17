"""Render original, deterministic mono game cues using only the standard library."""

import argparse
from array import array
import math
from pathlib import Path
import random
import sys
import wave

RATE = 44100
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "audio" / "sfx"

# start seconds, duration seconds, frequency Hz, waveform, gain, end frequency Hz
def note(start, duration, hz, shape="triangle", gain=0.65, end=None):
    return (start, duration, hz, shape, gain, end)


def phrase(pitches, duration, shape="triangle"):
    step = duration / len(pitches)
    return [note(i * step, step, hz, shape) for i, hz in enumerate(pitches)]


def step(duration, hz, noise_gain, grains=1):
    return [note(0, duration * 0.7, hz, gain=0.45)] + [
        note(i * 0.025, duration - i * 0.025, 700, "noise", noise_gain)
        for i in range(grains)
    ]


CUES = {
    "sfx-ui-focus": (0.08, [note(0, 0.08, 440, "pulse")]),
    "sfx-ui-confirm": (0.15, phrase([440, 554.37], 0.15, "pulse")),
    "sfx-ui-back": (0.13, phrase([392, 293.66], 0.13)),
    "sfx-action-unavailable": (0.18, [note(0, 0.07, 220, "pulse"),
                                      note(0.1, 0.08, 220, "pulse")]),
    "sfx-look-toggle": (0.13, [note(0, 0.09, 330, end=495),
                               note(0.085, 0.045, 550, "pulse", 0.35)]),
    "sfx-photo-open": (0.17, phrase([440, 554.37, 659.25], 0.17, "pulse")),
    "sfx-step-road": (0.09, step(0.09, 120, 0.4)),
    "sfx-step-grass": (0.12, step(0.12, 100, 0.6)),
    "sfx-step-forest": (0.13, step(0.13, 140, 0.4, 2)),
    "sfx-step-stone": (0.11, step(0.11, 195, 0.28)),
    "sfx-step-water": (0.14, [note(0, 0.14, 180, "pulse", 0.5, 280),
                               note(0.02, 0.12, 950, "noise", 0.45)]),
    "sfx-town-enter": (0.4, phrase([293.66, 369.99, 440], 0.4, "pulse")),
    "sfx-coins-earned": (0.24, phrase([440, 554.37, 659.25], 0.24)),
    "sfx-purchase": (0.18, [note(0, 0.065, 220, "pulse"),
                             note(0.06, 0.12, 330)]),
    "sfx-meal": (0.32, phrase([293.66, 369.99], 0.22) +
                       [note(0.2, 0.12, hz, "pulse", 0.22) for hz in [293.66, 440]]),
    "sfx-shelter": (0.6, phrase([440, 369.99, 293.66], 0.45) +
                          [note(0.35, 0.25, hz, gain=0.25) for hz in [293.66, 369.99, 440]]),
    "sfx-wake": (0.33, [note(0, 0.11, 293.66)] +
                       [note(0.11, 0.11, 369.99, "pulse"), note(0.22, 0.11, 440, "pulse")]),
    "sfx-needs-warning": (0.32, [note(0, 0.12, 330, "pulse", 0.45, 294),
                                  note(0.2, 0.12, 294, "pulse", 0.45, 262)]),
    "sfx-tarot-draw": (0.45, phrase([293.66, 349.23, 440, 392], 0.45)),
    "sfx-clue-found": (0.55, phrase([293.66, 349.23, 440, 329.63], 0.55, "pulse")),
    "sfx-reunion": (0.9, phrase([261.63, 329.63, 392], 0.54, "pulse") +
                         [note(0.5, 0.4, hz, gain=0.3) for hz in [261.63, 329.63, 392]]),
    "sfx-journey-ended": (0.65, phrase([392, 329.63, 293.66], 0.45) +
                               [note(0.4, 0.25, hz, gain=0.25) for hz in [261.63, 349.23]]),
    "sfx-music-cue": (0.06, [note(0, 0.06, 660, "pulse")]),
    "sfx-music-hit": (0.09, [note(0, 0.09, 554.37, "pulse", 0.6),
                              note(0, 0.09, 1108.74, gain=0.12)]),
    "sfx-music-miss": (0.08, [note(0, 0.08, 500, "noise", 0.3)]),
    "future-sfx-hidden-entrance": (0.75, [note(0, 0.3, 196)] +
                                  [note(0.3 + i * 0.15, 0.15, hz, "pulse", 0.4)
                                   for i, hz in enumerate([293.66, 349.23, 440])]),
    "future-sfx-night-event": (0.45, [note(0, 0.25, hz, "pulse", 0.3)
                                     for hz in [293.66, 392]] + [note(0.25, 0.2, 329.63)]),
}


def render(name):
    duration, voices = CUES[name]
    samples = [0.0] * round(duration * RATE)
    rng = random.Random(name)
    for start, length, hz, shape, gain, end in voices:
        count = round(length * RATE)
        offset = round(start * RATE)
        phase = filtered = 0.0
        for i in range(min(count, len(samples) - offset)):
            t = i / RATE
            frequency = hz + ((end - hz) * i / max(1, count - 1) if end else 0)
            phase = (phase + frequency / RATE) % 1
            if shape == "noise":
                # One-pole low-pass noise keeps step cues soft rather than hissy.
                coefficient = 1 - math.exp(-2 * math.pi * hz / RATE)
                filtered += coefficient * (rng.uniform(-1, 1) - filtered)
                value = filtered
            elif shape == "pulse":
                value = 0.75 * math.sin(2 * math.pi * phase) + 0.25 * math.sin(6 * math.pi * phase)
            else:
                value = 1 - 4 * abs(phase - 0.5)
            attack = min(1, t / 0.003)
            release = min(1, (count - 1 - i) / (RATE * 0.012))
            envelope = attack * max(0, release) * math.exp(-3 * t / length)
            samples[offset + i] += value * gain * envelope
    # Fixed gain preserves the deliberately quieter footsteps and missed-note cue.
    pcm = array("h", (round(value * 0.35 * 32767) for value in samples))
    return pcm


def generate(output=OUTPUT, overwrite=False):
    paths = [output / f"{name}.wav" for name in CUES]
    existing = [path for path in paths if path.exists()]
    if existing and not overwrite:
        raise FileExistsError(f"Refusing to replace existing cues; use --overwrite: {existing[0]}")
    output.mkdir(parents=True, exist_ok=True)
    for name, path in zip(CUES, paths):
        pcm = render(name)
        if sys.byteorder != "little":
            pcm.byteswap()
        with wave.open(str(path), "wb") as sound:
            sound.setnchannels(1)
            sound.setsampwidth(2)
            sound.setframerate(RATE)
            sound.writeframes(pcm.tobytes())
    return paths


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    for path in generate(args.output, args.overwrite):
        print(path)
