// Reading a residents list from any file, with an AI check.
//   Excel / CSV / text: SheetJS reads it first, then Groq's AI checks that reading and fixes
//                       mistakes (headers, swapped columns, two people in one cell, messy flat numbers).
//   Photo:              the AI reads the picture.
//   PDF:                typed pages are read as text, scanned or handwritten pages as pictures.
// Everything goes through the FlatDesk AI reader (a Cloudflare Worker that holds the Groq key).
// Groq doesn't keep the list or train on it.

import { AI_READER_URL } from "./ai-config.js";
import { shrinkPhoto, FOR_READING } from "./photo.js";
import { readSheet, residentsFromSheet, residentsFromList, RESIDENT_FILE_TYPES } from "./roster.js";

export const aiReaderOn = Boolean(AI_READER_URL);

// Everything the residents-list upload accepts
export const ANY_RESIDENT_FILE = RESIDENT_FILE_TYPES + (aiReaderOn ? ",.pdf,image/*" : "");

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const ROWS_PER_CHECK = 150; // big lists are checked in batches, so nothing gets cut off
const MAX_PDF_PAGES = 10;

// Returns { residents, skipped, ai } where ai is "checked" (AI read or checked it) or "skipped"
// (AI unavailable; this is our own reading). onStatus(key) reports progress.
// Throws an Error whose message is a translatable key.
export async function readAnyResidentsFile(file, onStatus = () => {}) {
  const type = file.name.toLowerCase().split(".").pop();
  const isImage = /^image\//.test(file.type) || ["jpg", "jpeg", "png", "heic", "webp"].includes(type);

  if (isImage || type === "pdf") {
    if (!aiReaderOn) throw new Error("sheetUnreadable");
    onStatus(type === "pdf" ? "readingPdf" : "aiReading");
    const found = type === "pdf" ? await readPdf(file, onStatus) : await askAI({ image: await shrinkPhoto(file, FOR_READING) });
    return { ...listOrThrow(found), ai: "checked" };
  }

  // Sheets and text files: our own reading first
  onStatus("readingFile");
  const sheet = await readSheet(file);
  let own = null;
  let ownError = null;
  try {
    own = residentsFromSheet(sheet);
  } catch (err) {
    ownError = err; // maybe the AI can still make sense of it
  }
  if (!aiReaderOn) {
    if (ownError) throw ownError;
    return { ...own, ai: "skipped" };
  }

  // Then the AI check
  onStatus("aiChecking");
  try {
    const found = await checkTextWithAI(sheet.text);
    // Safety: never let the AI quietly drop most of the list
    if (own && found.length < own.residents.length * 0.5) return { ...own, ai: "skipped" };
    return { ...listOrThrow(found), ai: "checked" };
  } catch (err) {
    console.error(err);
    if (ownError) throw ownError;
    return { ...own, ai: "skipped" };
  }
}

function listOrThrow(found) {
  try {
    return residentsFromList(found); // same clean-up as a sheet: split "A & B", drop repeats
  } catch (err) {
    throw new Error("aiNoRows");
  }
}

// Send the sheet as text, in batches, each with the header line so the AI knows the columns
async function checkTextWithAI(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.replace(/[,\s]/g, ""));
  if (!lines.length) return [];
  const header = lines[0];
  const found = [];
  for (let i = 0; i < lines.length; i += ROWS_PER_CHECK) {
    const batch = lines.slice(i, i + ROWS_PER_CHECK);
    if (i > 0) batch.unshift(header);
    found.push(...(await askAI({ text: batch.join("\n") })));
  }
  return found;
}

// PDF: typed pages give their text; pages without text (scans, photos) are sent as pictures
async function readPdf(file, onStatus) {
  await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const found = [];
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  for (let n = 1; n <= pages; n++) {
    onStatus("aiReading");
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str + (item.hasEOL ? "\n" : " ")).join("");
    if (text.replace(/\s/g, "").length > 20) {
      found.push(...(await checkTextWithAI(text)));
    } else {
      found.push(...(await askAI({ image: await pageToJpeg(page) })));
    }
  }
  return found;
}

async function pageToJpeg(page) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, 2000 / Math.max(base.width, base.height)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDFJS;
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve();
    };
    script.onerror = () => reject(new Error("aiFailed"));
    document.head.appendChild(script);
  });
}

// One request to the FlatDesk AI reader: { image } or { text }. Returns [{ name, flat }].
async function askAI(body) {
  let response;
  try {
    response = await fetch(AI_READER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error("aiFailed");
  }
  if (!response.ok) throw new Error("aiFailed");
  const { residents } = await response.json();
  return Array.isArray(residents) ? residents : [];
}
