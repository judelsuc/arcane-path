"""Validated prototype configuration shared by static and streaming maps."""

import math
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yml"


def load_config(path=CONFIG_PATH):
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != {"map"}:
        raise ValueError("Configuration must contain a map section.")
    section = data["map"]
    if not isinstance(section, dict) or set(section) != {"water_coverage_percent"}:
        raise ValueError("map must contain water_coverage_percent only.")
    value = section["water_coverage_percent"]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= 100:
        raise ValueError("map.water_coverage_percent must be greater than 0 and at most 100.")
    return data
