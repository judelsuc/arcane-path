import { journeyMapPhoto } from "./journey-map.mjs";

const WIDTH = 1240, HEIGHT = 1754, MARGIN = 80;
const encoder = new TextEncoder();

export function jpegPagesPdf(pages) {
  if (!pages.length) throw new Error("Cannot export an empty PDF.");
  const chunks = [], offsets = [0];
  let length = 0;
  const append = value => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${
    pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ")}] >>`);
  pages.forEach((jpeg, index) => {
    if (!(jpeg instanceof Uint8Array) || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      throw new Error("Invalid notebook page image.");
    }
    const id = 3 + index * 3;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] ` +
      `/Resources << /XObject << /Image ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    offsets[id + 1] = length;
    append(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    append(jpeg);
    append("\nendstream\nendobj\n");
    const commands = "q\n595.28 0 0 841.89 0 0 cm\n/Image Do\nQ\n";
    object(id + 2, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  });
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}

export async function notebookPdf({ title, photos, groups = [], clues = [], route = null, cover = null, t }) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("journalPdfCanvasError"));
  const pages = [];
  let y = MARGIN, dirty = false;
  function clear() {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#202020";
    context.textBaseline = "top";
    y = MARGIN;
    dirty = false;
  }
  async function flush() {
    if (!dirty) return;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error(t("journalPdfCanvasError"));
    pages.push(new Uint8Array(await blob.arrayBuffer()));
    clear();
  }
  async function text(value, size = 27, bold = false) {
    context.font = `${bold ? "bold " : ""}${size}px sans-serif`;
    const lineHeight = Math.ceil(size * 1.45);
    for (const paragraph of String(value).split("\n")) {
      let line = "";
      // Character wrapping also handles long URLs and notes without spaces.
      for (const character of paragraph) {
        if (context.measureText(line + character).width > WIDTH - MARGIN * 2 && line) {
          if (y + lineHeight > HEIGHT - MARGIN) await flush();
          context.font = `${bold ? "bold " : ""}${size}px sans-serif`;
          context.fillText(line, MARGIN, y);
          y += lineHeight;
          dirty = true;
          line = "";
        }
        line += character;
      }
      if (y + lineHeight > HEIGHT - MARGIN) await flush();
      context.font = `${bold ? "bold " : ""}${size}px sans-serif`;
      context.fillText(line, MARGIN, y);
      y += lineHeight;
      dirty = true;
    }
    y += 12;
  }
  clear();
  if (cover) {
    y = cover.artwork ? MARGIN : 300;
    await text(cover.title, 48, true);
    y += 60;
    await text(cover.subtitle, 32);
    if (cover.artwork) {
      const url = URL.createObjectURL(cover.artwork.blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const scale = Math.min(620 / image.naturalWidth, 620 / image.naturalHeight);
        context.drawImage(image, (WIDTH - image.naturalWidth * scale) / 2, y,
          image.naturalWidth * scale, image.naturalHeight * scale);
        y += image.naturalHeight * scale + 24;
        await text(`${cover.artwork.attribution} · ${cover.artwork.license}`, 20);
        await text(cover.artwork.licenseUrl, 18);
      } catch (reason) {
        throw new Error(t("journalImageError"), { cause: reason });
      } finally { URL.revokeObjectURL(url); }
    } else y += 120;
    for (const row of cover.rows) await text(`${row.label}: ${row.value}`, 30);
    await flush();
  }
  await text(title, 42, true);
  if (clues.length) {
    for (const clue of clues) await text(clue);
    await flush();
  }
  for (const group of groups) {
    await text(group.title, 32, true);
    for (const row of group.rows) await text(`${row.label}: ${row.value}`);
  }
  if (groups.length) await flush();
  if (!photos.length && !groups.length && !clues.length && !route) await text(t("journalEmpty"));
  const map = route ? await journeyMapPhoto(route, t) : null;
  for (const photo of [...(map ? [map] : []), ...photos]) {
    if (dirty) await flush();
    await text(photo.caption || (photo.unannotated ? t("fieldClue.photo") : photo.title), 34, true);
    const url = URL.createObjectURL(photo.blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (y + 200 > HEIGHT - MARGIN) await flush();
      const availableHeight = Math.max(200, Math.min(720, HEIGHT - MARGIN - y));
      const scale = Math.min((WIDTH - MARGIN * 2) / image.naturalWidth, availableHeight / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      context.drawImage(image, (WIDTH - width) / 2, y, width, height);
      y += height + 24;
      dirty = true;
    } catch (reason) {
      throw new Error(t("journalImageError"), { cause: reason });
    } finally { URL.revokeObjectURL(url); }
    if (photo.note) await text(photo.note);
    if (photo !== map) {
      await text(`${photo.attribution} · ${photo.license}`, 22);
      await text(`${t("journalSource")}: ${photo.sourceUrl}`, 20);
      await text(`${t("contentLicense")}: ${photo.licenseUrl}`, 20);
    }
    await flush();
  }
  await flush();
  return jpegPagesPdf(pages);
}

export function downloadNotebookPdf(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "arcane-notebook.pdf";
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
