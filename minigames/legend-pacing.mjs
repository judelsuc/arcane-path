export function adventurePacing(index, count) {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || count < 8 ||
      index < 0 || index >= count) throw new RangeError("Invalid adventure pacing position.");
  const beat = index % 8;
  const stage = index < 4 ? "introduce" : index === count - 1 ? "finale" :
    beat === 6 ? "rest" : beat === 7 || beat === 5 ? "combine" : "develop";
  return Object.freeze({ stage, complexity: ["combine", "finale"].includes(stage) ? 2 :
    stage === "develop" ? 1 : 0 });
}
