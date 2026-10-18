// The residents list: reading the Excel/CSV sheet the admin uploads,
// and checking a resident's flat number and name against it.

// SheetJS reads Excel files. It's only downloaded when an admin picks a file.
const SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

const NAME_HEADER = /name|resident|owner|tenant|member|occupant/i;
const FLAT_HEADER = /flat|unit|apartment|apt|door|house|villa/i;

// "b - 304" and "B304" are the same flat
export function flatKey(flat) {
  return String(flat).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// "  Priya  SHARMA " → "priya sharma" (works for any language, not just English)
export function nameKey(name) {
  return String(name).toLowerCase().replace(/[^\p{L}\s]/gu, "").trim().replace(/\s+/g, " ");
}

// Do two names share a word, allowing longer or shorter versions?
// "Nivashraj Bhava" matches "Nivash", "Priya" matches "Priya Sharma".
function namesMatch(typed, listed) {
  const typedWords = nameKey(typed).split(" ");
  const listedWords = nameKey(listed).split(" ");
  return typedWords.some((a) =>
    listedWords.some((b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))))
  );
}

// Is this person on the list? Their flat must be on it, and their name close to a name in that flat.
// Returns { resident } or { error: "noFlat" | "noName", flat } (app.js turns the error into a message).
export function checkResident(residents, name, flat) {
  const inFlat = residents.filter((r) => flatKey(r.flat) === flatKey(flat));
  if (!inFlat.length) return { error: "noFlat", flat };
  const match = inFlat.find((r) => namesMatch(name, r.name));
  if (!match) return { error: "noName", flat: inFlat[0].flat };
  return { resident: match };
}

// ---------- Reading the sheet ----------

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SHEETJS;
    script.onload = resolve;
    script.onerror = () => reject(new Error("excelLoad"));
    document.head.appendChild(script);
  });
}

// File types the residents list can come from
export const RESIDENT_FILE_TYPES = ".xlsx,.xls,.csv,.ods,.numbers,.txt";

// Returns { residents: [{ name, flat }], skipped }.
// Problems throw an Error whose message is a key app.js translates: "sheetEmpty", "needTwoCols", "noRows".
export async function readResidentsFile(file) {
  const type = file.name.toLowerCase().split(".").pop();
  if (type === "txt") return parsePastedList(await file.text()); // a plain list, like a pasted one

  await loadSheetJS();
  const book = type === "csv"
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer());
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  return parseRows(rows);
}

function parseRows(rows) {
  rows = rows.filter((row) => row.some((cell) => String(cell).trim()));
  if (!rows.length) throw new Error("sheetEmpty");

  // Look for a header row like "Name | Flat No." in the first few rows
  let nameCol = -1;
  let flatCol = -1;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map(String);
    const f = cells.findIndex((c) => FLAT_HEADER.test(c));
    const n = cells.findIndex((c, j) => j !== f && NAME_HEADER.test(c));
    if (f !== -1 && n !== -1) {
      flatCol = f;
      nameCol = n;
      start = i + 1;
      break;
    }
  }

  // No header: guess. The column that mostly has numbers in it is the flat number.
  if (flatCol === -1) {
    const width = Math.max(...rows.map((r) => r.length));
    if (width < 2) throw new Error("needTwoCols");
    const digitShare = (col) => rows.filter((r) => /\d/.test(r[col] || "")).length / rows.length;
    const cols = [...Array(width).keys()].sort((a, b) => digitShare(b) - digitShare(a));
    flatCol = cols[0];
    nameCol = cols.find((c) => c !== flatCol && rows.some((r) => String(r[c]).trim()));
  }

  return collect(rows.slice(start).map((row) => ({ flat: row[flatCol], names: row[nameCol] })));
}

// ---------- Reading a pasted list ----------

// Finds the flat number in a line: "A-101", "B 304", "C12", "D/14", "Flat 12", "No. 7"...
const FLAT_IN_LINE = /(?:\b(?:flat|unit|apt|apartment|door|house|no)\b\.?\s*(?:no\b\.?)?\s*[:#-]?\s*)?\b([A-Za-z]{0,2}\s?[-/]?\s?\d{1,5}[A-Za-z]?)\b/i;

// One resident per line, in any order:
//   A-101 Nivash  /  B-304 - Priya Sharma  /  Ravi Kumar, C-12  /  Flat 12: Meena
export function parsePastedList(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("sheetEmpty");

  return collect(lines.map((line) => {
    line = line.replace(/^(\d{1,3}[.)]\s+|[-•*]\s+)/, ""); // drop list numbering like "1. " or "• "
    const found = line.match(FLAT_IN_LINE);
    if (!found) return { flat: "", names: "" };
    const rest = line.slice(0, found.index) + " " + line.slice(found.index + found[0].length);
    return {
      flat: found[1].replace(/\s+/g, ""),
      names: rest.replace(/^[\s,:;|()\-–]+|[\s,:;|()\-–]+$/g, ""), // tidy separators around the name
    };
  }));
}

// Shared by sheets and pasted lists: turns { flat, names } entries into a clean residents list
function collect(entries) {
  const residents = [];
  const seen = new Set();
  let skipped = 0;

  for (const entry of entries) {
    const flat = String(entry.flat ?? "").trim().toUpperCase();
    // One cell can hold several people: "Ravi, Priya" or "Ravi & Priya"
    const names = String(entry.names ?? "")
      .split(/,|&|\band\b/i)
      .map((n) => n.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    if (!flat || !names.length) {
      skipped++;
      continue;
    }
    for (const name of names) {
      const key = flatKey(flat) + "|" + nameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      residents.push({ name, flat });
    }
  }

  if (!residents.length) throw new Error("noRows");
  return { residents, skipped };
}

// A small example sheet admins can download and fill in
export function sampleSheetUrl() {
  const csv = "Name,Flat\nPriya Sharma,B-304\nRavi Kumar,A-102\nMeena Iyer,A-203\nAnil & Sunita Rao,B-502\n";
  return URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
}
