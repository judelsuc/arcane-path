import { hungerPercent } from "./survival.mjs";
import { sympathy } from "./pressures.mjs";
import { practiceSkill } from "./practice.mjs";
import { journeyEventText, eventChances } from "./journey-events.mjs";
import { healthValue } from "./health.mjs";
import { equipmentModifiers } from "./equipment.mjs";

export function journeyStats({ state: s, survival, economy }, t, language = "fr") {
  const number = (value, digits = 0) => value.toFixed(digits);
  const row = (key, value) => ({ label: t(key), value: String(value) });
  const group = (key, rows) => ({ title: t(key), rows });
  const card = id => {
    const found = economy.tarot.find(c => c.id === id);
    if (!found) throw new Error("Unknown statistics tarot card.");
    return found[language === "en" ? "en" : "fr"];
  };
  const chances = eventChances(s, economy);
  const groups = [
    group("statsJourney", [
      row("statsName", s.name ?? t("unnamedCharacter")),
      row("statsElapsed", t("statsDuration", { days: Math.floor(s.elapsedMinutes / 1440),
        hours: Math.floor(s.elapsedMinutes / 60) % 24, minutes: Math.floor(s.elapsedMinutes) % 60 })),
      row("statsDistance", `${number(s.distanceMeters / 1000, 2)} km`),
      row("statsAscent", `${number(s.ascentMeters)} m`),
      row("statsDescent", `${number(s.descentMeters)} m`),
      row("statsReached", s.trail.index +
        (s.trail.arrivals?.some(a => a.stage === s.trail.index) ? 1 : 0)),
      row("statsState", s.ended ? t(`journeyEnded.${s.ended}`) : t("statsOngoing")),
    ]),
    group("needsTitle", [
      row("needsHealth", `${number(healthValue(s))}%`),
      row("needsHunger", `${number(hungerPercent(s, survival))}%`),
      row("needsFatigue", `${number(s.fatigue)}%`),
      row("statsAwake", `${number(s.awakeHours, 1)} h`),
      row("statsReserve", `${number(s.reserveKcal)} / ${survival.reserve_kcal} kcal`),
      row("statsEnergy", `${number(s.energyKcal)} kcal`),
      row("statsWallet", `${number(s.walletCents / 100, 2)} €`),
    ]),
    group("statsEncounters", [
      row("statsMeals", s.meals),
      row("statsSleeps", s.sleeps),
      row("statsMusic", s.performances ?? 0),
      row("statsCafeShifts", s.cafeShifts ?? 0),
      row("statsMusicSkill", t("practiceLevel", practiceSkill(s, "music"))),
      row("statsCafeSkill", t("practiceLevel", practiceSkill(s, "cafe"))),
      row("statsFaints", s.faints ?? 0),
      row("choice.forage", s.choiceCounts?.forage ?? 0),
      row("choice.beg", s.choiceCounts?.beg ?? 0),
      row("choice.steal", s.choiceCounts?.steal ?? 0),
    ]),
    group("statsCards", [
      row("statsBirthCard", card(s.birthCard)),
      row("statsDailyCard", card(s.dailyCard)),
      row("journeyEventChance", `${number(chances.occurrence * 100, 1)}%`),
      row("journeyEventFavourable", `${number(chances.positive * 100, 1)}%`),
    ]),
  ];
  if (s.pressures) {
    const p = s.pressures;
    groups.push(group("pressureTitle", [
      row("pressureVigilance", `${number(p.vigilance)}%`),
      row("pressureCleanliness", `${number(p.cleanliness)}%`),
      row("pressureSympathy", `${number(sympathy(s))}%`),
      row("statsReputation", p.reputation.find(r => r.locality === p.locality)?.value ?? 0),
      row("statsPlacements", `${p.placements.length} / 3`),
      row("statsLocalTime", `${number(p.localMinutes / 60, 1)} h`),
    ]));
    groups[3].rows.push(
      row("statsVigilanceRate", `${number(p.tarotFactor * 100)}%`),
      row("statsForgettingRate", `${number(p.tarotFactor * 100)}%`),
      row("statsCleanlinessRate", `${number((0.75 + p.tarotFactor * 0.25) * 100)}%`),
      row("statsSympathyBonus", number((1 - p.tarotFactor) * 30, 1)),
    );
  }
  if (s.events) {
    groups.push(group("journeyEventHistory", [
      row("journeyEventCount", s.events.count),
      row("journeyEventWalking", `${number(s.events.walkedMinutes)} min`),
      ...s.events.history.map(event => ({
        label: t("journeyEventHistoryTime", { minutes: Math.floor(event.elapsedMinutes) }),
        value: journeyEventText(event, t),
      })),
    ]));
  }
  if (s.journeyMiniGamesPlayed !== undefined) {
    groups.push(group("statsOtherActivities", [
      row("statsGamesPlayed", s.journeyMiniGamesPlayed),
      ...Object.entries(s.journeyMiniGameSkills ?? {}).map(([game, xp]) =>
        row(`journeyGame.${game}`, t("practiceLevel", { xp, level: Math.min(4, Math.floor(xp / 60)) }))),
    ]));
  }
  if (s.equipment) {
    const gear = equipmentModifiers(s.equipment);
    groups.push(group("equipmentTitle", [
      row("statsCarriedWeight", `${number(gear.carriedGrams / 1000, 2)} / 5.50 kg`),
      row("statsEquipmentCount", s.equipment.items.length),
      row("statsCompanion", s.equipment.dog?.name ?? (s.equipment.dog ? t("statsUnnamedDog") : t("statsNoCompanion"))),
      ...(s.equipment.dog ? [
        row("statsDogHunger", `${number(s.equipment.dog.hunger)}%`),
        row("statsDogCare", `${number(s.equipment.dog.careNeed)}%`),
      ] : []),
    ]));
  }
  return groups;
}
