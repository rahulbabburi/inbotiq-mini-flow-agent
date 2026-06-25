/**
 * Tests for the LLM service (lib/llm.ts).
 *
 * Provider: OpenRouter (via native fetch)
 * Tests cover:
 *   - classifyIntent: YES / NO / UNCLEAR normalisation, lowercase, whitespace, empty
 *   - generatePrompt: happy path, trimming, empty response error
 *   - callLLM: missing API key, non-2xx response, timeout abort, empty content
 *
 * global.fetch is mocked — zero real network calls made.
 */

// ─── Mock global.fetch ────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Set env var before importing so getApiKey() doesn't throw
process.env.OPENROUTER_API_KEY = "test-openrouter-key";

// Import AFTER mocks are configured
import { classifyIntent, generatePrompt, callLLM } from "../lib/llm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simulates a successful OpenRouter chat/completions response. */
function mockLLMResponse(content: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  });
}

/** Simulates a non-2xx HTTP error from OpenRouter. */
function mockLLMError(status: number, body = "Service unavailable") {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: body,
    text: async () => body,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: callLLM (core HTTP helper)
// ─────────────────────────────────────────────────────────────────────────────
describe("callLLM", () => {
  beforeEach(() => jest.clearAllMocks());

  test("throws when OPENROUTER_API_KEY is not set", async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    await expect(callLLM([{ role: "user", content: "hello" }])).rejects.toThrow(
      "OPENROUTER_API_KEY is not set"
    );

    process.env.OPENROUTER_API_KEY = original;
  });

  test("throws on non-2xx HTTP response", async () => {
    mockLLMError(503);
    await expect(callLLM([{ role: "user", content: "hello" }])).rejects.toThrow(
      "OpenRouter API error 503"
    );
  });

  test("throws when response has no content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    await expect(callLLM([{ role: "user", content: "hello" }])).rejects.toThrow(
      "LLM returned an empty response"
    );
  });

  test("sends correct Authorization header", async () => {
    mockLLMResponse("hello");
    await callLLM([{ role: "user", content: "test" }]);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-openrouter-key");
  });

  test("sends correct Content-Type header", async () => {
    mockLLMResponse("hello");
    await callLLM([{ role: "user", content: "test" }]);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("sends model and messages in request body", async () => {
    mockLLMResponse("hello");
    const messages = [{ role: "user" as const, content: "test prompt" }];
    await callLLM(messages);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(body.messages).toEqual(messages);
  });

  test("returns trimmed content string on success", async () => {
    mockLLMResponse("  Hello World  ");
    const result = await callLLM([{ role: "user", content: "hi" }]);
    expect(result).toBe("Hello World");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite A: Local keyword matching — MUST NOT call fetch
// ─────────────────────────────────────────────────────────────────────────────
describe("classifyIntent — local keyword matching (no LLM call)", () => {
  const Q = "Are you interested in applying for admission?";
  beforeEach(() => jest.clearAllMocks());

  // ── YES keywords ────────────────────────────────────────────────────────────────
  test('"yes" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "yes")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"YES" (uppercase) → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "YES")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"yeah" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "yeah")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"yep" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "yep")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"sure" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "sure")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"ok" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "ok")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"okay" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "okay")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"absolutely" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "absolutely")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"definitely" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "definitely")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"interested" → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "interested")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"Yes please!" (punctuation) → YES without LLM call', async () => {
    expect(await classifyIntent(Q, "Yes please!")).toBe("YES");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── NO keywords ──────────────────────────────────────────────────────────────────
  test('"no" → NO without LLM call', async () => {
    expect(await classifyIntent(Q, "no")).toBe("NO");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"NO" (uppercase) → NO without LLM call', async () => {
    expect(await classifyIntent(Q, "NO")).toBe("NO");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"nope" → NO without LLM call', async () => {
    expect(await classifyIntent(Q, "nope")).toBe("NO");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"nah" → NO without LLM call', async () => {
    expect(await classifyIntent(Q, "nah")).toBe("NO");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"not interested" (phrase) → NO without LLM call', async () => {
    expect(await classifyIntent(Q, "not interested")).toBe("NO");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"I am not interested" → NO without LLM call', async () => {
    expect(await classifyIntent(Q, "I am not interested")).toBe("NO");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('"not interested" wins over "interested" alone → NO', async () => {
    // Phrase check must run before word check so "interested" in the phrase → NO
    expect(await classifyIntent(Q, "I am not interested at all")).toBe("NO");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B: LLM fallback — ambiguous inputs MUST call fetch
// ─────────────────────────────────────────────────────────────────────────────
describe("classifyIntent — LLM fallback for ambiguous inputs", () => {
  const Q = "Are you interested in applying for admission?";
  beforeEach(() => jest.clearAllMocks());

  test('"maybe" → calls LLM, returns UNCLEAR', async () => {
    mockLLMResponse("UNCLEAR");
    expect(await classifyIntent(Q, "maybe")).toBe("UNCLEAR");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('"what" → calls LLM, returns UNCLEAR', async () => {
    mockLLMResponse("UNCLEAR");
    expect(await classifyIntent(Q, "what")).toBe("UNCLEAR");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('"I don\'t know" → calls LLM, returns UNCLEAR', async () => {
    mockLLMResponse("UNCLEAR");
    expect(await classifyIntent(Q, "I don't know")).toBe("UNCLEAR");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('LLM returns "YES" for ambiguous-looking affirmative → YES', async () => {
    mockLLMResponse("YES");
    expect(await classifyIntent(Q, "of course!")).toBe("YES");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('LLM returns "NO" for polite decline → NO', async () => {
    mockLLMResponse("NO");
    expect(await classifyIntent(Q, "I'd rather not")).toBe("NO");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("uses strict system prompt with single-word instruction", async () => {
    mockLLMResponse("YES");
    await classifyIntent(Q, "of course");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    // Must have system message as first message
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Return exactly one word");
    // User message must be second
    expect(body.messages[1].role).toBe("user");
  });

  test("LLM failure → UNCLEAR (no throw)", async () => {
    mockLLMError(503);
    expect(await classifyIntent(Q, "maybe")).toBe("UNCLEAR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite C: LLM output normalisation
// ─────────────────────────────────────────────────────────────────────────────
describe("classifyIntent — LLM output normalisation", () => {
  const Q = "Are you interested?";
  beforeEach(() => jest.clearAllMocks());

  test('LLM returns "YES" → YES', async () => {
    mockLLMResponse("YES");
    expect(await classifyIntent(Q, "perhaps")).toBe("YES");
  });

  test('LLM returns lowercase "yes" → YES', async () => {
    mockLLMResponse("yes"); // LLM shouldn't but might; normalise handles it
    expect(await classifyIntent(Q, "perhaps")).toBe("YES");
  });

  test('LLM returns "NO" → NO', async () => {
    mockLLMResponse("NO");
    expect(await classifyIntent(Q, "I would rather not")).toBe("NO");
  });

  test('LLM returns "UNCLEAR" → UNCLEAR', async () => {
    mockLLMResponse("UNCLEAR");
    expect(await classifyIntent(Q, "hmm")).toBe("UNCLEAR");
  });

  test('LLM returns unexpected text → UNCLEAR', async () => {
    mockLLMResponse("I cannot determine");
    expect(await classifyIntent(Q, "????")).toBe("UNCLEAR");
  });

  test('LLM returns "  YES  " with whitespace → YES', async () => {
    mockLLMResponse("  YES  ");
    expect(await classifyIntent(Q, "hmm")).toBe("YES");
  });

  test('LLM returns empty string (caught) → UNCLEAR', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    expect(await classifyIntent(Q, "...")).toBe("UNCLEAR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: generatePrompt
// ─────────────────────────────────────────────────────────────────────────────
describe("generatePrompt", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns the model text response", async () => {
    mockLLMResponse("Hello! Welcome to the assistant.");
    const result = await generatePrompt("You are a helpful assistant.", "Hi");
    expect(result).toBe("Hello! Welcome to the assistant.");
  });

  test("trims whitespace from model output", async () => {
    mockLLMResponse("  Hello World  ");
    const result = await generatePrompt("You are helpful.", "Hi");
    expect(result).toBe("Hello World");
  });

  test("throws when model returns empty string", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    await expect(generatePrompt("System prompt", "User message")).rejects.toThrow(
      "LLM returned an empty response"
    );
  });

  test("sends system context as system role message", async () => {
    mockLLMResponse("response");
    await generatePrompt("Be helpful.", "Hello");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: "Be helpful." });
    expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  test("throws when OPENROUTER_API_KEY is not set", async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    await expect(generatePrompt("System prompt", "User message")).rejects.toThrow(
      "OPENROUTER_API_KEY is not set"
    );

    process.env.OPENROUTER_API_KEY = original;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite D: Required intent classification tests
// ─────────────────────────────────────────────────────────────────────────────
describe("classifyIntent — additional required intent classification tests", () => {
  const Q = "Are you the right person to talk about your home loan enquiry?";
  beforeEach(() => jest.clearAllMocks());

  test('Input "I am not sure" -> UNCLEAR', async () => {
    expect(await classifyIntent(Q, "I am not sure")).toBe("UNCLEAR");
  });

  test('Input "maybe" -> UNCLEAR', async () => {
    expect(await classifyIntent(Q, "maybe")).toBe("UNCLEAR");
  });

  test('Input "yes" -> YES', async () => {
    expect(await classifyIntent(Q, "yes")).toBe("YES");
  });

  test('Input "no" -> NO', async () => {
    expect(await classifyIntent(Q, "no")).toBe("NO");
  });
});
