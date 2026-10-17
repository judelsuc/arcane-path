import json
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from config import load_config, CONFIG_PATH


class SurvivalConfigTests(unittest.TestCase):
    def test_exported_browser_settings_match_yaml(self):
        config = load_config()
        exported = json.loads((CONFIG_PATH.parent / "public/config.json").read_text())
        self.assertEqual(exported["survival"], config["survival"])
        self.assertEqual(exported["photos"], config["photos"])

    def test_invalid_survival_config_and_yaml_are_rejected(self):
        settings = load_config()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.yml"
            for key, value in [("reserve_kcal", 0), ("meal_minutes", True),
                               ("sleep_hours", float("nan")), ("sleep_limit_hours", 2),
                               ("profiles", {"balanced": {"strength": 100}})]:
                bad = deepcopy(settings)
                bad["survival"][key] = value
                path.write_text(yaml.safe_dump(bad))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    load_config(path)
            path.write_text("map: [\n")
            with self.assertRaisesRegex(ValueError, "Invalid YAML"):
                load_config(path)
