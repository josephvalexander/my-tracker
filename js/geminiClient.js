/**
 * geminiClient.js
 *
 * Drafts business description / competitive advantage / market
 * position using the Gemini API with Google Search grounding, so the
 * draft is based on actual current web content rather than pure
 * training-data guesswork. Output is always a draft for the user to
 * review and edit — never auto-saved, never feeds the verdict logic.
 *
 * Setup required before this works: a Gemini API key from
 * https://aistudio.google.com/apikey, pasted into Settings → AI draft
 * assist (stored in this device's local settings, not committed to
 * the repo). Because this is a client-side-only PWA with no backend,
 * the key necessarily lives in the browser — acceptable here since
 * this is a single-user app, but worth knowing it's visible to anyone
 * with devtools access to this device.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// If this model is retired (Google has been cycling Flash versions
// roughly every few months), update this one constant — nothing else
// in this file needs to change.
const GEMINI_MODEL = "gemini-2.5-flash";

const FIELD_PROMPTS = {
  business:
    "In exactly one plain sentence, describe what {name} ({ticker}), an Indian listed company, actually does as a business. No jargon, no marketing language — explain it the way you'd explain it to someone with no finance background.",
  moat:
    "In one or two plain sentences, describe {name}'s ({ticker}) competitive advantage or moat, if any — pricing power, brand strength, patents/IP, switching costs, regulatory barriers, or network effects. If you can't find clear evidence of a durable advantage, say so plainly rather than inventing one.",
  marketPosition:
    "In one plain sentence, describe {name}'s ({ticker}) position in its market — is it a clear leader, a top-3 player, or more of a commodity/undifferentiated player in a crowded space? Say so plainly, including if the answer is uncertain.",
};

/**
 * Calls Gemini with Google Search grounding enabled, asking it to
 * draft one qualitative field. Returns { text, sources } where
 * `sources` are the grounding citations Gemini actually used — always
 * show these in the UI so the draft is checkable, not just trusted.
 */
async function draftQualitativeField(apiKey, fieldKey, stock) {
  const promptTemplate = FIELD_PROMPTS[fieldKey];
  if (!promptTemplate) throw new Error(`Unknown field: ${fieldKey}`);

  const prompt = promptTemplate
    .replace("{name}", stock.name || stock.ticker)
    .replace("{ticker}", stock.ticker)
    .replace("{name}", stock.name || stock.ticker); // moat prompt uses {name} twice

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new GeminiError(`Gemini request failed: ${response.status} ${errBody}`, response.status);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).join("") ?? "";

  const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const sources = groundingChunks
    .map((chunk) => chunk.web)
    .filter(Boolean)
    .map((web) => ({ title: web.title, uri: web.uri }));

  return { text: text.trim(), sources };
}

class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

const geminiClientExports = { draftQualitativeField, GeminiError, FIELD_PROMPTS };

if (typeof module !== "undefined" && module.exports) {
  module.exports = geminiClientExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, geminiClientExports);
}
