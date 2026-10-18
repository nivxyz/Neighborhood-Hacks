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
export function checkResident(residents, name, flat) {
  const inFlat = residents.filter((r) => flatKey(r.flat) === flatKey(flat));
  if (!inFlat.length) {
    return { error: `Flat ${flat} isn't on this building's list. Check the number, or ask your admin to add you.` };
  }
  const match = inFlat.find((r) => namesMatch(name, r.name));
  if (!match) {
    return { error: `That name doesn't match anyone in flat ${inFlat[0].flat}. Use the name your admin has on the list.` };
  }
  return { resident: match };
}

// ---------- Reading the sheet ----------

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SHEETJS;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Couldn't load the Excel reader. Check your internet."));
    document.head.appendChild(script);
  });
}

// Returns { residents: [{ name, flat }], skipped } or throws an Error with a friendly message
export async function readResidentsFile(file) {
  await loadSheetJS();
  const book = file.name.toLowerCase().endsWith(".csv")
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer());
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  return parseRows(rows);
}

function parseRows(rows) {
  rows = rows.filter((row) => row.some((cell) => String(cell).trim()));
  if (!rows.length) throw new Error("That sheet is empty.");

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
    if (width < 2) throw new Error("The sheet needs two columns: name and flat number.");
    const digitShare = (col) => rows.filter((r) => /\d/.test(r[col] || "")).length / rows.length;
    const cols = [...Array(width).keys()].sort((a, b) => digitShare(b) - digitShare(a));
    flatCol = cols[0];
    nameCol = cols.find((c) => c !== flatCol && rows.some((r) => String(r[c]).trim()));
  }

  const residents = [];
  const seen = new Set();
  let skipped = 0;

  for (const row of rows.slice(start)) {
    const flat = String(row[flatCol] ?? "").trim().toUpperCase();
    // One cell can hold several people: "Ravi, Priya" or "Ravi & Priya"
    const names = String(row[nameCol] ?? "")
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

  if (!residents.length) throw new Error("Couldn't find any names and flat numbers in that sheet.");
  return { residents, skipped };
}

// A small example sheet admins can download and fill in
export function sampleSheetUrl() {
  const csv = "Name,Flat\nPriya Sharma,B-304\nRavi Kumar,A-102\nMeena Iyer,A-203\nAnil & Sunita Rao,B-502\n";
  return URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
}
