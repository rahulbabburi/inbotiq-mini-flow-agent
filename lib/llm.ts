/**
 * LLM Service — the ONLY file that configures the LLM provider.
 *
 * Provider: OpenRouter  (https://openrouter.ai)
 * Model:    meta-llama/llama-3.3-70b-instruct:free
 * API:      OpenAI-compatible chat-completions over native fetch (no extra SDK)
 *
 * Exports:
 *   callLLM()        → shared HTTP helper; also imported by lib/validator.ts
 *   generatePrompt() → crafts a natural-language bot reply
 *   classifyIntent() → classifies user intent → "YES" | "NO" | "UNCLEAR"
 *
 * Why OpenRouter instead of Gemini?
 *   The Gemini API (v1beta) is returning 503 Service Unavailable under high
 *   load. OpenRouter provides a stable, free-tier proxy with the same OpenAI-
 *   compatible interface across many open-source models.
 *
 * Switching providers in the future:
 *   1. Change BASE_URL and MODEL below.
 *   2. Update the env-var name if needed.
 *   3. Nothing else in the project needs to change.
 *
 * SECURITY: Server-side only. Never import from client components.
 */

import type { IntentClassification } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * meta-llama/llama-3.3-70b-instruct:free
 *   - Free tier on OpenRouter (no billing required)
 *   - 70B parameter model — strong instruction following
 *   - Reliable for classification and short conversational replies
 *
 * To switch: change this constant only.
 */
const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/** Request timeout in milliseconds. */
const TIMEOUT_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "system" | "user" | "assistant";

export interface LLMMessage {
  role: Role;
  content: string;
}

interface OpenRouterChoice {
  message: { content: string };
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
  error?: { message: string };
}

// Map GEMINI_API_KEY to OPENROUTER_API_KEY at module load time if needed
if (process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
  process.env.OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;
}

// ─── API Key ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "OPENROUTER_API_KEY is not set. " +
        "Add it to .env.local and restart the dev server.\n" +
        "Get a free key at: https://openrouter.ai/keys"
    );
  }
  return key.trim();
}

// ─── Core HTTP Call ───────────────────────────────────────────────────────────

/**
 * Sends a chat-completions request to OpenRouter and returns the first
 * choice's message content (trimmed).
 *
 * Exported so lib/validator.ts can reuse the same client config without
 * duplicating the provider URL, model name, or API key logic.
 *
 * @param messages - Ordered array of system / user / assistant messages
 * @returns        - Trimmed text content of the model's response
 * @throws         - On missing API key, non-2xx response, or empty content
 */
export async function callLLM(messages: LLMMessage[]): Promise<string> {
  const apiKey = getApiKey();

  // AbortController gives us a clean timeout without external libraries
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter attribution headers (optional but recommended)
        "HTTP-Referer": "https://mini-flow-agent.vercel.app",
        "X-Title": "Mini Conversational Flow Agent",
      },
      body: JSON.stringify({ model: MODEL, messages }),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(
      `OpenRouter API error ${response.status} ${response.statusText}: ${body}`
    );
  }

  const data = (await response.json()) as OpenRouterResponse;

  // Surface any provider-level errors returned inside a 200 response
  if (data.error) {
    throw new Error(`OpenRouter model error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim() ?? "";

  if (!content) {
    throw new Error(
      `LLM returned an empty response for model "${MODEL}". ` +
        `Messages: ${JSON.stringify(messages).slice(0, 200)}`
    );
  }

  return content;
}

// ─── generatePrompt ──────────────────────────────────────────────────────────

/**
 * Generates a conversational reply given a system persona and the user's message.
 *
 * @param systemContext - Instructions / persona for the model
 * @param userMessage   - The user's raw message
 * @returns             - Trimmed text response
 * @throws              - If key is missing, model errors, or response is empty
 */
export async function generatePrompt(
  systemContext: string,
  userMessage: string
): Promise<string> {
  return callLLM([
    { role: "system", content: systemContext },
    { role: "user", content: userMessage },
  ]);
}

// ─── Local Intent Classifier ─────────────────────────────────────────────────

/**
 * Fast local keyword classifier — O(n) string operations, zero network calls.
 * Implements negation checks to avoid false positives (e.g. matching "sure"
 * in "I am not sure" as YES).
 */
function localClassify(message: string): IntentClassification | null {
  const normalised = message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "") // remove apostrophes so "don't" becomes "dont", "that's" becomes "thats"
    .replace(/[^\w\s]/g, " ") // replace other punctuation with space
    .replace(/\s+/g, " ") // collapse multiple spaces
    .trim();

  // 1. Check NO phrases
  const noPhrases = ["not interested", "wrong person", "not me", "somebody else"];
  if (noPhrases.some((phrase) => normalised.includes(phrase))) {
    return "NO";
  }

  // 2. Check YES phrases
  const yesPhrases = ["yes thats me", "yes that is me", "i am the right person", "im the right person"];
  if (yesPhrases.some((phrase) => normalised.includes(phrase))) {
    return "YES";
  }

  // 3. Keyword check for single words or simple sentences
  const YES_KEYWORDS = new Set([
    "yes", "yeah", "yep", "y", "sure", "ok", "okay",
    "absolutely", "definitely", "interested", "correct"
  ]);

  const NO_KEYWORDS = new Set(["no", "nope", "nah", "n", "negative"]);

  const words = normalised.split(/\s+/).filter(Boolean);

  // Check if any word is a NO keyword
  for (const word of words) {
    if (NO_KEYWORDS.has(word)) return "NO";
  }

  // Check if any word is a YES keyword, but ONLY if there is no negation in the message!
  const hasNegation = words.some(
    (w) => w === "not" || w === "dont" || w === "no" || w === "never"
  );
  if (!hasNegation) {
    for (const word of words) {
      if (YES_KEYWORDS.has(word)) return "YES";
    }
  }

  return null; // ambiguous — needs LLM
}

// ─── classifyIntent ───────────────────────────────────────────────────────────

/**
 * Classifies the user's response as YES, NO, or UNCLEAR.
 *
 * Two-stage pipeline:
 *   Stage 1 — Local keyword match (instant, no LLM call)
 *             Handles obvious affirmatives and negatives ("yes", "no", "sure", etc.)
 *             as well as common unclear expressions.
 *   Stage 2 — LLM fallback with a strict system prompt
 *             Only invoked for ambiguous inputs that the keyword list cannot resolve.
 *
 * Normalisation (applied to LLM output):
 *   raw → trim() → toUpperCase()
 *   contains "YES" → YES
 *   contains "NO"  → NO
 *   otherwise      → UNCLEAR
 *
 * Safe default: any LLM failure returns UNCLEAR so the conversation stays alive.
 *
 * @param question    - The question that was asked to the user (context for LLM)
 * @param userMessage - The user's raw response to classify
 * @returns           - "YES" | "NO" | "UNCLEAR"
 */
export async function classifyIntent(
  question: string,
  userMessage: string,
  nodeId = "?"
): Promise<IntentClassification> {
  // ── Stage 1: Fast local match ─────────────────────────────────────────────
  const localResult = localClassify(userMessage);
  if (localResult !== null) return localResult;

  // ── Stage 2: LLM fallback ─────────────────────────────────────────────────
  //
  // System prompt forces a single-word response with no decoration.
  // Extensive examples help the model stay on-task even for unusual inputs.
  const systemPrompt =
    `You are an intent classifier.\n\n` +
    `Your task is to classify the user's response to a yes/no question into exactly one of three categories:\n` +
    `- YES (if the user is agreeing, confirming, or saying yes/yeah/yep/sure/correct/absolutely/of course/yes that's me/I am the right person)\n` +
    `- NO (if the user is disagreeing, declining, or saying no/nope/not me/wrong person/negative/somebody else/not interested)\n` +
    `- UNCLEAR (if the user is uncertain, asking a clarifying question, saying they don't know, saying "maybe", "may be", "I am not sure", "not sure", "can you explain", "what?", "huh", "perhaps", "possibly", "I need more information", "explain", "tell me more")\n\n` +
    `Rules:\n` +
    `1. If the user indicates any uncertainty or says "not sure" or "I am not sure" or "maybe", classify as UNCLEAR.\n` +
    `2. Respond with ONLY the word: YES, NO, or UNCLEAR. Return exactly one word.\n` +
    `3. Never explain. Never add punctuation. Never add markdown.\n\n` +
    `Examples:\n` +
    `- "yes that's me" -> YES\n` +
    `- "I am the right person" -> YES\n` +
    `- "wrong person" -> NO\n` +
    `- "somebody else" -> NO\n` +
    `- "I am not sure" -> UNCLEAR\n` +
    `- "not sure" -> UNCLEAR\n` +
    `- "maybe" -> UNCLEAR\n` +
    `- "can you explain" -> UNCLEAR\n` +
    `- "what do you mean" -> UNCLEAR\n` +
    `- "what?" -> UNCLEAR\n` +
    `- "huh" -> UNCLEAR\n` +
    `- "perhaps" -> UNCLEAR\n` +
    `- "possibly" -> UNCLEAR\n` +
    `- "explain" -> UNCLEAR\n` +
    `- "tell me more" -> UNCLEAR\n` +
    `- "I need more information" -> UNCLEAR`;

  const userPrompt =
    `Question asked: "${question}"\n` +
    `User responded: "${userMessage}"\n\n` +
    `Classify:`;

  console.log(`🤖 Calling LLM`);
  console.log(`User input: "${userMessage}"`);
  console.log(`Current node: ${nodeId}`);

  let raw: string;
  try {
    raw = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ]);
  } catch (err) {
    // LLM unavailable — default to UNCLEAR so the conversation shows the
    // clarification prompt rather than crashing
    console.log(`LLM response: ERROR (${err})`);
    console.log(`Intent: UNCLEAR`);
    return "UNCLEAR";
  }

  // Normalise: trim → uppercase → check for label as whole word
  // Using word-boundary regex prevents false positives:
  //   "CANNOT" contains "NO" but should not classify as NO
  //   "EYES" contains "YES" but should not classify as YES
  const normalised = raw.trim().toUpperCase();
  const intent = /\bYES\b/.test(normalised)
    ? "YES"
    : /\bNO\b/.test(normalised)
    ? "NO"
    : "UNCLEAR";

  console.log(`LLM response: "${raw}"`);
  console.log(`Intent: ${intent}`);

  return intent;
}
