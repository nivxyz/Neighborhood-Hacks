// Reading a photo of a residents register with AI.
// Only used when the admin chooses it. The photo goes to the FlatDesk AI reader (a Cloudflare
// Worker), which asks Groq's AI for the names and flat numbers. Nothing is stored.

import { AI_READER_URL } from "./ai-config.js";
import { shrinkPhoto, FOR_READING } from "./photo.js";
import { residentsFromList } from "./roster.js";

export const aiReaderOn = Boolean(AI_READER_URL);

// Returns { residents, skipped } like a sheet, or throws "photo", "aiFailed" or "aiNoRows"
export async function readRegisterPhoto(file) {
  const image = await shrinkPhoto(file, FOR_READING);
  let response;
  try {
    response = await fetch(AI_READER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
  } catch (err) {
    throw new Error("aiFailed");
  }
  if (!response.ok) throw new Error("aiFailed");
  const { residents } = await response.json();
  try {
    return residentsFromList(residents || []); // same clean-up as a sheet: split "A & B", drop repeats
  } catch (err) {
    throw new Error("aiNoRows");
  }
}
