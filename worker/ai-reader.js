// FlatDesk AI reader: a Cloudflare Worker that reads a photo of a building's residents register.
// FlatDesk sends the photo here, this asks Groq's vision AI for the names and flat numbers,
// and sends back just the list. The Groq key stays here as a secret and never reaches a browser.
//
// Settings (Cloudflare dashboard → your Worker → Settings → Variables and Secrets):
//   GROQ_API_KEY    Secret. Your Groq API key.
//   ALLOWED_ORIGIN  The FlatDesk website, e.g. https://neighborhood-hacks.deployxa.online
//                   (several can be separated with commas)
//   MODEL           Optional. Groq vision model to use. Defaults to the one below.

const DEFAULT_MODEL = "qwen/qwen3.8-27b";
const MAX_IMAGE_CHARS = 3000000; // about a 2 MB photo; Groq refuses very large base64 images
const MAX_RESIDENTS = 3000;

const PROMPT = `This is a photo of an apartment building's residents list. It may be a printed register, a notice, a spreadsheet on a screen, or a handwritten page.
Read every resident's name and their flat or unit number.
Reply with JSON only, exactly in this shape: {"residents":[{"name":"...","flat":"..."}]}
Rules:
- One entry per person. If one line lists several people for the same flat, make one entry for each.
- Keep names spelled as written.
- Write flat numbers the way they appear, for example "B-304" or "12".
- Skip headings, totals, phone numbers, dates, signatures and anything that is not a resident.
- If you cannot read any residents, reply {"residents":[]}.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const fromFlatDesk = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": fromFlatDesk ? origin : allowed[0] || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    // Only the FlatDesk website may use this (so other sites can't spend your Groq allowance)
    if (request.method === "OPTIONS") return new Response(null, { status: fromFlatDesk ? 204 : 403, headers: cors });
    if (request.method !== "POST" || !fromFlatDesk) return reply({ error: "notAllowed" }, 403, cors);
    if (!env.GROQ_API_KEY) return reply({ error: "notSetUp" }, 500, cors);

    let image;
    try {
      image = (await request.json()).image;
    } catch (err) {
      return reply({ error: "badRequest" }, 400, cors);
    }
    if (typeof image !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE_CHARS) {
      return reply({ error: "badImage" }, 400, cors);
    }

    const groq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.MODEL || DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        }],
      }),
    });

    if (!groq.ok) {
      console.log("Groq error", groq.status, await groq.text()); // shows in the Worker's logs, not to users
      return reply({ error: "aiFailed" }, 502, cors);
    }
    const data = await groq.json();
    const text = data.choices?.[0]?.message?.content || "";
    return reply({ residents: readResidents(text) }, 200, cors);
  },
};

// Pull the {"residents": [...]} list out of the AI's answer, keeping only sensible entries
function readResidents(text) {
  text = String(text).replace(/<think>[\s\S]*?<\/think>/g, ""); // some models think out loud first
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) return [];
  try {
    const list = JSON.parse(text.slice(start, end + 1)).residents;
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) => r && typeof r.name === "string" && (typeof r.flat === "string" || typeof r.flat === "number"))
      .map((r) => ({ name: r.name.trim().slice(0, 60), flat: String(r.flat).trim().slice(0, 20) }))
      .filter((r) => r.name && r.flat)
      .slice(0, MAX_RESIDENTS);
  } catch (err) {
    return [];
  }
}

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
