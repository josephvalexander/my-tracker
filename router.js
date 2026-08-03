/**
 * geminiClient.js
 *
 * Drafts business description / competitive advantage / market
 * position using the Gemini API with Google Search grounding, so the
 * draft is based on actual current web content rather than pure
 * training-data guesswork. Output is always a draft for the user to
 * review and edit — never auto-saved, never feeds the verdict logic.
 *
 * Request pattern deliberately mirrors a confirmed-working direct
 * browser-to-Gemini integration (no proxy, no backend) from a sibling
 * project: API key as a `?key=` query parameter (not a custom header —
 * an earlier version of this file used `x-goog-api-key`, which risks
 * triggering a CORS preflight that may not be allowed; the query-param
 * style is what's been verified working from a static front-end with
 * no server in between), `gemini-2.5-flash-lite` as the model, and a
 * fallback that retries without the search-grounding tool if the key
 * doesn't have grounding enabled.
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
// If this model is retired, update this one constant — nothing else
// in this file needs to change. Matches the model confirmed working
// in the sibling project's live integration.
const GEMINI_MODEL = "gemini-2.5-flash-lite";

const FIELD_PROMPTS = {
  business:
    "In exactly one plain sentence, describe what {name} ({ticker}), an Indian listed company, actually does as a business. No jargon, no marketing language — explain it the way you'd explain it to someone with no finance background.",
  moat:
    "In one or two plain sentences, describe {name}'s ({ticker}) competitive advantage or moat, if any — pricing power, brand strength, patents/IP, switching costs, regulatory barriers, or network effects. If you can't find clear evidence of a durable advantage, say so plainly rather than inventing one.",
  marketPosition:
    "In one plain sentence, describe {name}'s ({ticker}) position in its market — is it a clear leader, a top-3 player, or more of a commodity/undifferentiated player in a crowded space? Say so plainly, including if the answer is uncertain.",
};

class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

function buildRequestBody(prompt, withSearch) {
  return JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
  });
}

async function callGemini(apiKey, prompt, withSearch) {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildRequestBody(prompt, withSearch),
    signal: AbortSignal.timeout(40000),
  });
}

/**
 * Calls Gemini with Google Search grounding enabled, asking it to
 * draft one qualitative field. Returns { text, sources } where
 * `sources` are the grounding citations Gemini actually used — always
 * show these in the UI so the draft is checkable, not just trusted.
 *
 * Retries once on a 429 (rate limit) after a short backoff, and falls
 * back to a non-grounded request if the key doesn't have search
 * grounding enabled (surfaced by Gemini as a 400 mentioning the tool).
 */
/**
 * Shared request logic: sends a prompt with search grounding, retries
 * once on rate limit, falls back to non-grounded if the key lacks
 * grounding, and extracts text + cited sources from the response.
 * Used by both draftQualitativeField (free text) and draftShareholding
 * (structured JSON) below — they differ only in the prompt and how
 * the returned text gets parsed afterward.
 */
async function runGroundedPrompt(apiKey, prompt) {
  let res = await callGemini(apiKey, prompt, true);

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 8000));
    res = await callGemini(apiKey, prompt, true);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = (errData.error?.message || "").toLowerCase();
    if (res.status === 400 && (errMsg.includes("tool") || errMsg.includes("search") || errMsg.includes("grounding"))) {
      res = await callGemini(apiKey, prompt, false);
    }
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new GeminiError(errData.error?.message || `Gemini API error ${res.status}`, res.status);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.filter((p) => p.text).map((p) => p.text).join("");

  if (!text) {
    const reason = candidate?.finishReason || "unknown";
    throw new GeminiError(`No text in response (finishReason: ${reason})`);
  }

  const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const sources = groundingChunks
    .map((chunk) => chunk.web)
    .filter(Boolean)
    .map((web) => ({ title: web.title, uri: web.uri }));

  return { text: text.trim(), sources };
}

/**
 * Drafts business / moat / market position as free text.
 */
async function draftQualitativeField(apiKey, fieldKey, stock) {
  const promptTemplate = FIELD_PROMPTS[fieldKey];
  if (!promptTemplate) throw new Error(`Unknown field: ${fieldKey}`);

  const prompt = promptTemplate.replaceAll("{name}", stock.name || stock.ticker).replaceAll("{ticker}", stock.ticker);
  return runGroundedPrompt(apiKey, prompt);
}

/**
 * Drafts promoter shareholding % and pledging % as STRUCTURED data,
 * not free text — this field feeds deriveVerdict() directly as a hard
 * pass/fail flag (any pledging > 0% forces "No"), so a wrong number
 * here is meaningfully more damaging than a vague business
 * description. The prompt explicitly instructs the model to say it
 * doesn't know rather than guess, and the result always surfaces the
 * source + as-of date next to the number so the user has something
 * concrete to check before saving — same "draft, never auto-save"
 * pattern as the qualitative fields, just with a stricter prompt and
 * structured parsing instead of free text.
 */
async function draftShareholding(apiKey, stock) {
  const name = stock.name || stock.ticker;
  const prompt = `Search for ${name} (${stock.ticker}), an Indian listed company's most recent quarterly promoter shareholding pattern. I need exactly: promoter holding percentage, and promoter pledged shares percentage. 

Respond with ONLY a JSON object in this exact shape, no other text, no markdown formatting:
{"promoterHolding": <number or null>, "promoterPledging": <number or null>, "asOfQuarter": "<e.g. Q4 FY26 or null>", "confident": <true or false>}

If you cannot find a reliable, recent figure for either value, use null for that value and set "confident" to false. Do not guess or estimate — an incorrect number here is worse than an honest "unknown".`;

  const { text, sources } = await runGroundedPrompt(apiKey, prompt);

  // Model may wrap JSON in markdown code fences despite instructions —
  // strip those before parsing rather than failing on them.
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new GeminiError(`Gemini's response wasn't valid JSON: ${text.slice(0, 200)}`);
  }

  return {
    promoterHolding: typeof parsed.promoterHolding === "number" ? parsed.promoterHolding : null,
    promoterPledging: typeof parsed.promoterPledging === "number" ? parsed.promoterPledging : null,
    asOfQuarter: parsed.asOfQuarter ?? null,
    confident: parsed.confident === true,
    sources,
  };
}

const geminiClientExports = { draftQualitativeField, draftShareholding, GeminiError, FIELD_PROMPTS };

if (typeof module !== "undefined" && module.exports) {
  module.exports = geminiClientExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, geminiClientExports);
}
