import { setupPursuit } from "./pursuit-ui.mjs";
import { beginPursuit, advancePursuit, beginPursuitEscape, settlePursuitEscape,
  validatePursuit, pursuitDifficulty } from "./pursuit.mjs";
import { skyState } from "./sky.mjs";
import { validatePursuitAtmosphere } from "./pursuit-atmosphere.mjs";

const COPY = {
  fr: {
    title: "Test de la fuite", language: "Langue", terrain: "Terrain",
    scope: "Test isolé : aucune sauvegarde de voyage n'est modifiée. Choisissez un rythme, puis commencez la fuite. Espace ou Haut pour sauter ; Aide pour mettre en pause.",
    restart: "Recommencer le test", forest: "Forêt", building: "Rues", hill: "Rochers", plain: "Campagne",
    completed: "Fuites précédentes (test)", condition: "État (test)",
    fresh: "En pleine forme (−2)", good: "Bonne forme (−1)", normal: "État moyen (0)",
    tired: "Fatigué (+1)", exhausted: "Épuisé (+2)",
    time: "Moment (test)", weather: "Météo (test)", fog: "Brouillard (test)",
    day: "Jour", dawn: "Aube", dusk: "Crépuscule", night: "Nuit",
    clear: "Sec", cloudy: "Nuageux", rain: "Pluie", storm: "Forte pluie", snow: "Neige",
    auto: "Selon le contexte", none: "Aucun", light: "Léger", dense: "Dense",
  },
  en: {
    title: "Escape playtest", language: "Language", terrain: "Terrain",
    scope: "Isolated test: no journey saves are changed. Choose a pace, then start the escape. Space or Up to jump; Help to pause.",
    restart: "Restart test", forest: "Woodland", building: "Streets", hill: "Rocky ground", plain: "Open country",
    completed: "Previous escapes (test)", condition: "Condition (test)",
    fresh: "Fresh (−2)", good: "Good (−1)", normal: "Average (0)", tired: "Tired (+1)", exhausted: "Exhausted (+2)",
    time: "Time of day (test)", weather: "Weather (test)", fog: "Fog (test)",
    day: "Day", dawn: "Dawn", dusk: "Dusk", night: "Night",
    clear: "Dry", cloudy: "Cloudy", rain: "Rain", storm: "Heavy rain", snow: "Snow",
    auto: "Contextual", none: "None", light: "Light", dense: "Dense",
  },
};
const controls = document.querySelector("#test-controls");
const language = document.querySelector("#language"), terrain = document.querySelector("#terrain");
const restart = document.querySelector("#restart-test"), error = document.querySelector("#test-error");
const completed = document.querySelector("#completed"), condition = document.querySelector("#condition");
const time = document.querySelector("#time"), weather = document.querySelector("#weather"), fog = document.querySelector("#fog");
const CONDITIONS = {
  fresh: { health: 100, fatigue: 0, awakeHours: 0 },
  good: { health: 90, fatigue: 20, awakeHours: 6 },
  normal: { health: 70, fatigue: 40, awakeHours: 12 },
  tired: { health: 40, fatigue: 60, awakeHours: 16 },
  exhausted: { health: 15, fatigue: 85, awakeHours: 24 },
};
let state, serial = 0;
const ui = setupPursuit({
  context: () => state ? { state } : null,
  act(action) {
    const next = action.type === "begin" ? beginPursuitEscape(state, action.mode)
      : settlePursuitEscape(state, action.result);
    state = next;
    return true;
  },
});
const dialog = document.querySelector(".pursuit-dialog");
dialog.addEventListener("close", () => {
  if (!dialog.open) document.querySelector("#test-controls-anchor").append(controls);
});
function prepare() {
  ui.reset();
  document.documentElement.lang = language.value;
  const copy = COPY[language.value];
  document.title = `Arcane Path — ${copy.title}`;
  document.querySelector("#test-title").textContent = copy.title;
  document.querySelector("#test-scope").textContent = copy.scope;
  document.querySelector("#test-language").textContent = copy.language;
  document.querySelector("#test-terrain").textContent = copy.terrain;
  document.querySelector("#test-completed").textContent = copy.completed;
  document.querySelector("#test-condition").textContent = copy.condition;
  for (const id of ["time", "weather", "fog"]) document.querySelector(`#test-${id}`).textContent = copy[id];
  restart.textContent = copy.restart;
  for (const option of terrain.options) option.textContent = copy[option.value];
  for (const option of condition.options) option.textContent = copy[option.value];
  for (const select of [time, weather, fog]) for (const option of select.options) option.textContent = copy[option.value];
  error.textContent = "";
  try {
    if (!completed.checkValidity()) throw new Error(completed.validationMessage);
    const latitude = 48.85, longitude = 2.35;
    const day = Date.UTC(2026, 10, 13);
    const solar = skyState(new Date(day + 12 * 3_600_000), latitude, longitude);
    const moment = { day: solar.noon, dawn: solar.sunrise, dusk: solar.sunset, night: day + 3_600_000 }[time.value];
    const initial = beginPursuit({ col: 10, row: 10, elapsedMinutes: 0,
      startedAt: moment - 2340 * 60_000 + serial++, ended: null, ...CONDITIONS[condition.value] });
    const info = { latitude, longitude, weather: { months: Array.from({ length: 12 }, () =>
      ({ condition: weather.value, minC: 5, maxC: 12 })) } };
    state = advancePursuit({ ...initial, elapsedMinutes: 2340 }, { terrain: terrain.value }, info);
    validatePursuit(state);
    // Override only this in-memory test; real journeys derive the count from validated history.
    state.pursuit.pending.difficulty = pursuitDifficulty(state, Number(completed.value));
    if (fog.value !== "auto") state.pursuit.pending.atmosphere.fog = fog.value;
    validatePursuitAtmosphere(state.pursuit.pending.atmosphere);
    ui.update();
    dialog.prepend(controls);
  } catch (reason) {
    error.textContent = reason.message;
    console.error("Escape playtest failed:", reason);
  }
}
restart.addEventListener("click", prepare);
terrain.addEventListener("change", prepare);
language.addEventListener("change", prepare);
completed.addEventListener("change", prepare);
condition.addEventListener("change", prepare);
for (const select of [time, weather, fog]) select.addEventListener("change", prepare);
prepare();
