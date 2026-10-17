"""Validated prototype configuration shared by static and streaming maps."""

import math
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yml"


def load_config(path=CONFIG_PATH):
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        raise ValueError(f"Invalid YAML configuration: {error}") from error
    if not isinstance(data, dict) or not {"map"} <= set(data) <= {"map", "photos", "survival"}:
        raise ValueError("Configuration must contain a map section.")
    section = data["map"]
    if not isinstance(section, dict) or set(section) != {"water_coverage_percent"}:
        raise ValueError("map must contain water_coverage_percent only.")
    value = section["water_coverage_percent"]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= 100:
        raise ValueError("map.water_coverage_percent must be greater than 0 and at most 100.")
    photos = data.get("photos", {"max_per_cell": 5})
    if (not isinstance(photos, dict) or set(photos) != {"max_per_cell"}
            or isinstance(photos["max_per_cell"], bool)
            or not isinstance(photos["max_per_cell"], int)
            or not 1 <= photos["max_per_cell"] <= 20):
        raise ValueError("photos.max_per_cell must be an integer between 1 and 20.")
    if "survival" in data:
        survival = data["survival"]
        limits = {
            "reserve_kcal": (100, 10000), "basal_kcal_per_hour": (1, 500),
            "meal_kcal": (1, 10000), "meal_minutes": (1, 120), "sleep_hours": (1, 12),
            "sleep_recovery_per_hour": (1, 8), "sleep_fatigue_recovery_per_hour": (1, 100),
            "sleep_metabolism_factor": (0.1, 1), "rest_minutes": (1, 120),
            "rest_fatigue_recovery": (1, 100), "warning_percent": (1, 99),
            "sleep_warning_hours": (1, 48), "sleep_limit_hours": (2, 96),
            "hunger_speed_penalty": (0, 0.5), "sleep_speed_penalty": (0, 0.5),
        }
        if not isinstance(survival, dict) or set(survival) != {*limits, "profiles"}:
            raise ValueError("survival must contain every documented coefficient and profiles.")
        for key, (low, high) in limits.items():
            value = survival[key]
            if (isinstance(value, bool) or not isinstance(value, (int, float))
                    or not math.isfinite(value) or not low <= value <= high):
                raise ValueError(f"survival.{key} must be between {low} and {high}.")
        if survival["sleep_warning_hours"] >= survival["sleep_limit_hours"]:
            raise ValueError("Sleep warning must precede sleep limit.")
        profiles = survival["profiles"]
        if not isinstance(profiles, dict) or set(profiles) != {"balanced", "sturdy", "enduring"}:
            raise ValueError("survival.profiles must define balanced, sturdy and enduring.")
        for profile in profiles.values():
            if not isinstance(profile, dict) or set(profile) != {"strength", "endurance", "pace"}:
                raise ValueError("Each profile requires strength, endurance and pace.")
            if any(isinstance(v, bool) or not isinstance(v, int) or not 1 <= v <= 5 for v in profile.values()):
                raise ValueError("Profile attributes must be integers from 1 to 5.")
    return {**data, "photos": photos}
