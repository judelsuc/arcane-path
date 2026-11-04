import { validateJournalPhoto } from "./photo-journal.mjs";

export const MAX_NOTEBOOK_BYTES = 48 * 1024 * 1024;

export async function encodeNotebook(photos) {
  if (photos.length > 1000) throw new Error("The notebook exceeds the 1000-entry sharing limit.");
  let total = 0;
  return Promise.all(photos.map(async photo => {
    validateJournalPhoto(photo);
    total += photo.blob.size;
    if (total > MAX_NOTEBOOK_BYTES) throw new Error("The notebook exceeds the 48 MiB sharing limit.");
    const bytes = new Uint8Array(await photo.blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return { id: photo.id, title: photo.title, sourceUrl: photo.sourceUrl,
      attribution: photo.attribution, license: photo.license, licenseUrl: photo.licenseUrl,
      note: photo.note, caption: photo.caption ?? "", unannotated: photo.unannotated,
      pinnedAt: photo.pinnedAt, mime: photo.blob.type, image: btoa(binary) };
  }));
}

export function decodeNotebook(entries) {
  if (!Array.isArray(entries)) throw new Error("Invalid shared notebook.");
  let total = 0;
  return entries.map(entry => {
    const binary = atob(entry.image);
    total += binary.length;
    if (total > MAX_NOTEBOOK_BYTES) throw new Error("Shared notebook exceeds the 48 MiB limit.");
    const blob = new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: entry.mime });
    const photo = { ...entry, blob };
    delete photo.image;
    validateJournalPhoto(photo);
    return photo;
  });
}
