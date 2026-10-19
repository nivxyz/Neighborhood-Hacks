// Address of the FlatDesk AI reader (the Cloudflare Worker in worker/ai-reader.js).
// It reads photos of residents registers. While this is empty, the AI option is hidden.
// This is safe to put on GitHub: the Groq key is kept secret inside the Worker, not here.

export const AI_READER_URL = "https://flatdesk-ai-reader.lighningcraftpro.workers.dev/";
