/**
 * Tests for lib/validator.ts
 *
 * lib/llm's callLLM() is mocked — zero real network calls.
 * Tests cover:
 *   - Email: regex extraction (happy path, sentence embedding, invalid)
 *   - Phone: regex extraction (happy path, invalid → callLLM fallback)
 *   - Person name: callLLM validation (valid name, question response, empty)
 *   - Course: callLLM extraction (embedded sentence, short name, invalid)
 *   - parseValidationJSON: markdown fences, missing JSON, malformed
 *   - getDefaultRetryMessage: all four types
 */

// ─── Mock lib/llm (callLLM) ───────────────────────────────────────────────────
jest.mock("../lib/llm", () => ({
  callLLM: jest.fn(),
  generatePrompt: jest.fn(),
  classifyIntent: jest.fn(),
}));

process.env.OPENROUTER_API_KEY = "test-key";

import { validateInput, getDefaultRetryMessage } from "../lib/validator";
import { callLLM } from "../lib/llm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simulates a valid JSON response from callLLM */
function mockLLM(json: object) {
  (callLLM as jest.Mock).mockResolvedValueOnce(JSON.stringify(json));
}

/** Simulates a raw text (possibly non-JSON) response from callLLM */
function mockLLMRaw(text: string) {
  (callLLM as jest.Mock).mockResolvedValueOnce(text);
}

/** Simulates callLLM throwing (e.g. 503) */
function mockLLMThrow(msg = "Service unavailable") {
  (callLLM as jest.Mock).mockRejectedValueOnce(new Error(msg));
}

// ─────────────────────────────────────────────────────────────────────────────
// Email validation (regex — no Gemini calls)
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInput — email (regex)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("plain email address → valid, lowercased", async () => {
    const result = await validateInput("Rahul@Gmail.com", "email", "What is your email?");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("rahul@gmail.com");
    expect(callLLM).not.toHaveBeenCalled(); // no LLM call needed
  });

  test("email embedded in sentence → extracts it correctly", async () => {
    const result = await validateInput(
      "My email is rahul@gmail.com please use that",
      "email",
      "What is your email?"
    );
    expect(result.valid).toBe(true);
    expect(result.value).toBe("rahul@gmail.com");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("email with subdomain → valid", async () => {
    const result = await validateInput(
      "student@cs.university.edu",
      "email",
      "What is your email?"
    );
    expect(result.valid).toBe(true);
    expect(result.value).toBe("student@cs.university.edu");
  });

  test("no email pattern → invalid, no LLM call", async () => {
    const result = await validateInput("I don't have an email", "email", "What is your email?");
    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("empty input → invalid", async () => {
    const result = await validateInput("", "email", "What is your email?");
    expect(result.valid).toBe(false);
  });

  test("plain text without @ → invalid", async () => {
    const result = await validateInput("rahulgmail", "email", "What is your email?");
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phone validation (regex)
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInput — phone (regex)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("plain 10-digit number → valid", async () => {
    const result = await validateInput("9876543210", "phone", "What is your phone?");
    expect(result.valid).toBe(true);
    expect(result.value).toBeTruthy();
  });

  test("number with country code → valid", async () => {
    const result = await validateInput("+91 9876543210", "phone", "What is your phone?");
    expect(result.valid).toBe(true);
  });

  test("no phone pattern → LLM fallback called", async () => {
    mockLLM({ valid: false, reason: "No phone number found." });
    const result = await validateInput("no phone here", "phone", "What is your phone?");
    expect(result.valid).toBe(false);
    expect(callLLM).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Person name validation (LLM)
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInput — person_name (LLM)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("valid name → returns true with extracted value", async () => {
    mockLLM({ valid: true, value: "Rahul" });
    const result = await validateInput("Rahul", "person_name", "What is your name?");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("Rahul");
  });

  test("full name with last name → stored correctly", async () => {
    mockLLM({ valid: true, value: "Rahul Sharma" });
    const result = await validateInput("Rahul Sharma", "person_name", "What is your name?");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("Rahul Sharma");
  });

  test("question as response → Gemini marks invalid", async () => {
    mockLLM({ valid: false, reason: "The user asked a question instead of providing a name." });
    const result = await validateInput(
      "Is it ok to give my name?",
      "person_name",
      "What is your name?"
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("name");
  });

  test("irrelevant sentence → invalid", async () => {
    mockLLM({ valid: false, reason: "Not a name." });
    const result = await validateInput(
      "I am really interested in this program",
      "person_name",
      "What is your name?"
    );
    expect(result.valid).toBe(false);
  });

  test("empty string → immediately invalid without LLM call", async () => {
    const result = await validateInput("", "person_name", "What is your name?");
    expect(result.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("LLM returns JSON wrapped in markdown fences → parsed correctly", async () => {
    mockLLMRaw("```json\n{\"valid\": true, \"value\": \"Priya\"}\n```");
    const result = await validateInput("Priya", "person_name", "What is your name?");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("Priya");
  });

  test("LLM returns JSON with surrounding text → JSON extracted", async () => {
    mockLLMRaw('Sure! Here is my answer: {"valid": true, "value": "Arjun"} Hope that helps.');
    const result = await validateInput("Arjun", "person_name", "What is your name?");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("Arjun");
  });

  test("LLM returns completely non-JSON → safely returns invalid", async () => {
    mockLLMRaw("I cannot determine the answer.");
    const result = await validateInput("??", "person_name", "What is your name?");
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Course validation (LLM)
// ─────────────────────────────────────────────────────────────────────────────
describe("validateInput — course (LLM)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("plain course name → valid", async () => {
    mockLLM({ valid: true, value: "Computer Science" });
    const result = await validateInput(
      "Computer Science",
      "course",
      "Which course are you interested in?"
    );
    expect(result.valid).toBe(true);
    expect(result.value).toBe("Computer Science");
  });

  test("course name embedded in sentence → LLM extracts it", async () => {
    mockLLM({ valid: true, value: "Computer Science" });
    const result = await validateInput(
      "I want Computer Science",
      "course",
      "Which course are you interested in?"
    );
    expect(result.valid).toBe(true);
    expect(result.value).toBe("Computer Science");
  });

  test("MBA abbreviation → valid", async () => {
    mockLLM({ valid: true, value: "MBA" });
    const result = await validateInput("MBA", "course", "Which course?");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("MBA");
  });

  test("unrelated response → invalid", async () => {
    mockLLM({ valid: false, reason: "No recognisable course name found." });
    const result = await validateInput(
      "I don't know yet",
      "course",
      "Which course are you interested in?"
    );
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultRetryMessage
// ─────────────────────────────────────────────────────────────────────────────
describe("getDefaultRetryMessage", () => {
  test("person_name — mentions name and full name", () => {
    const msg = getDefaultRetryMessage("person_name");
    expect(msg.toLowerCase()).toContain("name");
  });

  test("email — mentions email and format hint", () => {
    const msg = getDefaultRetryMessage("email");
    expect(msg.toLowerCase()).toContain("email");
  });

  test("course — mentions course or program", () => {
    const msg = getDefaultRetryMessage("course");
    const lower = msg.toLowerCase();
    expect(lower.includes("course") || lower.includes("program")).toBe(true);
  });

  test("phone — mentions phone number", () => {
    const msg = getDefaultRetryMessage("phone");
    expect(msg.toLowerCase()).toContain("phone");
  });
});
