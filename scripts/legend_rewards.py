"""Immutable reward selection at first town discovery; only published approved artwork."""

import json
from pathlib import Path

CATALOGUE = json.loads((Path(__file__).resolve().parents[1] / "public/legend-rewards.json").read_text())


def choose_reward(db, sql, seed):
    item = CATALOGUE["natures"][seed % len(CATALOGUE["natures"])]
    index = seed // len(CATALOGUE["natures"])
    reward = {"version": 1, "nature": item["id"],
              "effect": item["effects"][index % len(item["effects"])],
              "material": CATALOGUE["materials"][(index // 4) % len(CATALOGUE["materials"])],
              "motif": CATALOGUE["motifs"][(index // 32) % len(CATALOGUE["motifs"])]}
    if item["kind"] == "icon":
        rows = db.execute(sql("SELECT id,payload,decisions FROM admin_collections WHERE status='published' ORDER BY id")).fetchall()
        icons = []
        for collection_id, payload, decisions in rows:
            approved = json.loads(decisions)
            for icon in json.loads(payload)["icons"]:
                if approved.get(icon["id"]) == "approved":
                    icons.append({**icon, "id": f"generated:{collection_id}:{icon['id']}"})
        if icons:
            reward["icon"] = icons[index % len(icons)]
    return reward
