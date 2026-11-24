import { journeyEquipmentModifiers } from "./equipment.mjs";

export function companionRecord(state) {
  const dog = state.equipment?.dog;
  return dog ? { companion: { ...(dog.name ? { name: dog.name } : {}),
    ready: journeyEquipmentModifiers(state).dogReady } } : {};
}

export function validateCompanionRecord(record) {
  const companion = record?.companion;
  if (companion === undefined) return;
  if (!companion || typeof companion !== "object" || Array.isArray(companion) ||
      typeof companion.ready !== "boolean" ||
      Object.keys(companion).some(key => !["name", "ready"].includes(key)) ||
      companion.name !== undefined && (typeof companion.name !== "string" ||
        !companion.name.trim() || Array.from(companion.name).length > 40 ||
        /[<>\u0000-\u001f\u007f]/.test(companion.name))) {
    throw new Error("Invalid saved companion participation.");
  }
}

export function companionText(record, activity, t) {
  if (!record?.companion) return "";
  return t(`companion.${record.companion.ready ? activity : "unavailable"}`, {
    name: record.companion.name ?? t("companion.dog"),
  });
}
