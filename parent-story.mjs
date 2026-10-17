const MOTIVES = ["seasonal", "debt", "family", "departure", "collectors", "legend"];
const MODES = ["walk", "hitch", "bus", "train"];
const CLUES = [
  ["discuss", "photo", "letter", "buy"],
  ["search", "letter", "guestbook", "discuss"],
  ["ticket", "photo", "buy", "search"],
];

export function parentStage(state) {
  const story = state.trail?.story;
  if (!story) return state.trail.stages.length - 1;
  return story.movement.reduce((stage, move) =>
    state.elapsedMinutes >= move.elapsedMinutes ? move.stage : stage, 9);
}

export function parentReunion(state) {
  return state.trail.index >= parentStage(state);
}

export function parentClues(trail, index = trail.index) {
  return trail.story?.visits[index].clues ?? CLUES[index % CLUES.length];
}

export function parentSighting(state, index) {
  const stage = state.trail.stages[index];
  let hash = 2166136261;
  for (const char of `${state.startedAt}:${stage.witnessId}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const visit = state.trail.story?.visits[index];
  if (!visit) return { variant: hash % 3, precision: null };
  const ageDays = Math.max(0, Math.floor(
    (state.startedAt + state.elapsedMinutes * 60_000 - visit.departure) / 86_400_000));
  return { variant: hash % 3, precision: ageDays < 7 ? "recent" : ageDays < 30 ? "weeks" : "old" };
}

export function validateParentStory(trail) {
  const story = trail.story;
  if (story === undefined) return;
  const fail = () => { throw new Error("Invalid parent story in journey save."); };
  const integer = n => Number.isSafeInteger(n);
  if (!story || story.version !== 1 || story.fictional !== true ||
      typeof story.birthCard !== "string" || !MOTIVES.includes(story.motive) ||
      !MODES.includes(story.mode) || !["upright", "reversed"].includes(story.orientation) ||
      !["stationary", "mobile"].includes(story.finalState) ||
      !integer(story.generatedAt) || !Array.isArray(story.visits) ||
      story.visits.length !== trail.stages.length ||
      trail.stages.length !== (story.finalState === "mobile" ? 13 : 10) ||
      !Array.isArray(story.movement) || story.movement.length !== trail.stages.length - 10) fail();
  for (const [index, visit] of story.visits.entries()) {
    if (!visit || !integer(visit.arrival) || !integer(visit.departure) ||
        !Number.isFinite(new Date(visit.arrival).getTime()) ||
        !Number.isFinite(new Date(visit.departure).getTime()) ||
        visit.arrival >= visit.departure ||
        !integer(visit.nights) || visit.nights < 1 || visit.nights > 3 ||
        visit.departure - visit.arrival !== visit.nights * 86_400_000 ||
        visit.purchases !== visit.nights + 1 ||
        JSON.stringify(visit.clues) !== JSON.stringify(CLUES[index % CLUES.length]) ||
        index && story.visits[index - 1].departure >= visit.arrival) fail();
  }
  if (story.visits[9].departure > story.generatedAt) fail();
  for (const [index, move] of story.movement.entries()) {
    if (!move || move.stage !== index + 10 || move.elapsedMinutes !== (index + 1) * 7 * 1440 ||
        story.visits[index + 10].arrival !== story.generatedAt + move.elapsedMinutes * 60_000) fail();
  }
  for (const [field, min, max] of [["falseLeads", 1, 3], ["lore", 1, 2]]) {
    const entries = story[field];
    if (!Array.isArray(entries) || entries.length < min || entries.length > max ||
        new Set(entries.map(e => e?.stage)).size !== entries.length) fail();
    for (const entry of entries) {
      if (!entry || !integer(entry.stage) || entry.stage < 1 || entry.stage > 8) fail();
      if (field === "falseLeads"
        ? !["Ari", "Lou", "Charlie"].includes(entry.traveler) || entry.reward !== "contact"
        : !["legend", "orphan"].includes(entry.kind)) fail();
    }
  }
}

export function validateStoryProgress(state) {
  const { trail } = state;
  if (!trail.story) {
    if (trail.rumors !== undefined) throw new Error("Unexpected parent rumor history.");
    return;
  }
  if (trail.story.birthCard !== state.birthCard || trail.story.generatedAt !== state.startedAt) {
    throw new Error("Parent story does not belong to this journey.");
  }
  const rumors = trail.rumors ?? [];
  if (!Array.isArray(rumors) || new Set(rumors.map(r => r?.stage)).size !== rumors.length ||
      rumors.some(r => !r || !trail.story.falseLeads.some(b => b.stage === r.stage) ||
        r.stage > trail.index || !Number.isFinite(r.elapsedMinutes) || r.elapsedMinutes < 15 ||
        r.elapsedMinutes > state.elapsedMinutes)) throw new Error("Invalid parent rumor history.");
  if (trail.completed && trail.index - 1 < parentStage(state)) {
    throw new Error("Reunion before catching the mobile parent.");
  }
}
