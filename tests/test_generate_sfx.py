from array import array
from pathlib import Path
import re
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from generate_sfx import CUES, RATE, generate, render


class SoundEffectsTests(unittest.TestCase):
    def test_all_briefs_have_one_deterministic_nonclipping_cue(self):
        briefs = (Path(__file__).resolve().parents[1] / "audio-prompts" / "game-sounds.md").read_text()
        self.assertEqual(set(re.findall(r"^### ([\w-]+) -", briefs, re.M)), set(CUES))
        for name, (duration, _) in CUES.items():
            with self.subTest(name=name):
                pcm = render(name)
                self.assertEqual(pcm, render(name))
                self.assertEqual(len(pcm), round(duration * RATE))
                self.assertEqual(pcm[0], 0)
                self.assertEqual(pcm[-1], 0)
                self.assertGreater(max(abs(s) for s in pcm), 100)
                self.assertLess(max(abs(s) for s in pcm), 32767 * 0.7)
                first_sound = next(i for i, s in enumerate(pcm) if abs(s) > 10)
                self.assertLess(first_sound / RATE, 0.005)

    def test_wav_format_and_existing_file_protection(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = generate(Path(directory))
            self.assertEqual(len(paths), 27)
            for path in paths:
                with wave.open(str(path)) as sound:
                    self.assertEqual(sound.getnchannels(), 1)
                    self.assertEqual(sound.getsampwidth(), 2)
                    self.assertEqual(sound.getframerate(), RATE)
                    self.assertEqual(sound.getnframes(), round(CUES[path.stem][0] * RATE))
                    pcm = array("h", sound.readframes(sound.getnframes()))
                    self.assertGreater(len(pcm), 0)
            before = paths[0].read_bytes()
            with self.assertRaises(FileExistsError):
                generate(Path(directory))
            self.assertEqual(paths[0].read_bytes(), before)
            generate(Path(directory), overwrite=True)
            self.assertEqual(paths[0].read_bytes(), before)
