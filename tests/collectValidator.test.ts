/**
 * Tests for lib/collectValidator.ts — two-stage validation pipeline.
 *
 * lib/llm is mocked so every test is deterministic and has zero network calls.
 * Tests assert:
 *   a) Local-only validation (LLM mock must NOT be called)
 *   b) LLM fallback validation (LLM mock IS called, result is parsed)
 *
 * Coverage per type:
 *   name       — direct names, sentence-embedded names, reject phrases, LLM fallback
 *   email      — valid regex, embedded email, invalid
 *   phone      — 10-digit, country code, too-short, no digits
 *   loan_amount — with unit, bare number, no digit
 *   date       — formatted, relative, LLM fallback for natural language
 *   course     — abbreviation, sentence-embedded, LLM fallback, reject
 */

jest.mock("../lib/llm", () => ({
  callLLM: jest.fn(),
  classifyIntent: jest.fn(),
  generatePrompt: jest.fn(),
}));

import { callLLM } from "../lib/llm";
import { validateCollect } from "../lib/collectValidator";

/** Convenience: make callLLM resolve with a given string */
function mockLLM(response: string) {
  (callLLM as jest.Mock).mockResolvedValueOnce(response);
}

/** Convenience: make callLLM reject (simulates network failure) */
function mockLLMError() {
  (callLLM as jest.Mock).mockRejectedValueOnce(new Error("LLM unavailable"));
}

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// name
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — name", () => {
  // ── Local YES (no LLM) ──────────────────────────────────────────────────────
  test("'Rahul' → valid locally, no LLM call", async () => {
    const r = await validateCollect("Rahul", "name");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Rahul");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'rohan sharma' → valid locally, title-cased to 'Rohan Sharma'", async () => {
    const r = await validateCollect("rohan sharma", "name");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Rohan Sharma");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'My name is Rahul' → valid locally, extracts 'Rahul'", async () => {
    const r = await validateCollect("My name is Rahul", "name");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Rahul");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("\"I'm Priya\" → valid locally, extracts 'Priya'", async () => {
    const r = await validateCollect("I'm Priya", "name");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Priya");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("\"I am Rohan Sharma\" → valid locally, extracts 'Rohan Sharma'", async () => {
    const r = await validateCollect("I am Rohan Sharma", "name");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Rohan Sharma");
    expect(callLLM).not.toHaveBeenCalled();
  });

  // ── Local NO (no LLM) ──────────────────────────────────────────────────────
  test("'What?' → invalid locally, no LLM call", async () => {
    const r = await validateCollect("What?", "name");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'Help' → invalid locally, no LLM call", async () => {
    const r = await validateCollect("Help", "name");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'Sorry' → invalid locally", async () => {
    const r = await validateCollect("Sorry", "name");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'Can you explain?' → invalid locally", async () => {
    const r = await validateCollect("Can you explain?", "name");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'Why?' → invalid locally", async () => {
    const r = await validateCollect("Why?", "name");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  // ── LLM fallback ───────────────────────────────────────────────────────────
  test("\"I didn't understand\" → LLM called, LLM returns INVALID", async () => {
    mockLLM("INVALID");
    // "I didn't understand" starts with 'I' + space and doesn't match name patterns
    // → local validator returns null → LLM fallback triggered
    const r = await validateCollect("I didn't understand", "name");
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(r.valid).toBe(false);
  });

  test("LLM returns 'VALID: Rahul' → valid: true, value: 'Rahul'", async () => {
    mockLLM("VALID: Rahul");
    const r = await validateCollect("I didn't understand", "name");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Rahul");
  });

  test("LLM error → valid: false (safe default)", async () => {
    mockLLMError();
    const r = await validateCollect("I didn't understand", "name");
    expect(r.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// email
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — email", () => {
  test("plain email → valid, lowercased", async () => {
    const r = await validateCollect("Rahul@Example.com", "email");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("rahul@example.com");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("email with subdomain → valid", async () => {
    const r = await validateCollect("user@mail.example.co.uk", "email");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("email embedded in sentence → extracted", async () => {
    const r = await validateCollect("my email is rahul@test.com please", "email");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("rahul@test.com");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'What?' → invalid, no LLM", async () => {
    const r = await validateCollect("What?", "email");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'I don't have email' → invalid, no LLM", async () => {
    const r = await validateCollect("I don't have email", "email");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("plain text without @ → invalid", async () => {
    const r = await validateCollect("rahulgmail.com", "email");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phone
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — phone", () => {
  test("10-digit number → valid", async () => {
    const r = await validateCollect("9876543210", "phone");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("number with country code (+91) → valid", async () => {
    const r = await validateCollect("+91 9876543210", "phone");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'What?' → invalid (no digits)", async () => {
    const r = await validateCollect("What?", "phone");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("too short number '123' → invalid", async () => {
    const r = await validateCollect("123", "phone");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loan_amount
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — loan_amount", () => {
  test("'around 30 lakhs' → valid, extracts '30 lakh'", async () => {
    const r = await validateCollect("around 30 lakhs", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("30 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'₹25,00,000' → valid", async () => {
    const r = await validateCollect("₹25,00,000", "loan_amount");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'50 million' → valid", async () => {
    const r = await validateCollect("50 million", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toContain("50");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'What?' → invalid, no LLM", async () => {
    const r = await validateCollect("What?", "loan_amount");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'Help' → invalid, no LLM", async () => {
    const r = await validateCollect("Help", "loan_amount");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'I don't know' → invalid, no LLM", async () => {
    const r = await validateCollect("I don't know", "loan_amount");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'Explain' → invalid, no LLM", async () => {
    const r = await validateCollect("Explain", "loan_amount");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// date
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — date", () => {
  test("'15/01/2024' → valid locally", async () => {
    const r = await validateCollect("15/01/2024", "date");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'15 January 2024' → valid locally", async () => {
    const r = await validateCollect("15 January 2024", "date");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'tomorrow' → valid locally", async () => {
    const r = await validateCollect("tomorrow", "date");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'I don't know' → invalid, no LLM", async () => {
    const r = await validateCollect("I don't know", "date");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("natural language date with no strict pattern match → LLM called", async () => {
    (callLLM as jest.Mock).mockResolvedValue("VALID: early February 2025");
    // "early February" has month name but no strict date pattern → null → LLM
    const r = await validateCollect("early February", "date");
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(r.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// course
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — course", () => {
  test("'MBA' abbreviation → valid locally, no LLM", async () => {
    const r = await validateCollect("MBA", "course");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("MBA");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'I want to do Data Science' → valid locally", async () => {
    const r = await validateCollect("I want to do Data Science", "course");
    expect(r.valid).toBe(true);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'What?' → invalid locally, no LLM", async () => {
    const r = await validateCollect("What?", "course");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'Help' → invalid locally, no LLM", async () => {
    const r = await validateCollect("Help", "course");
    expect(r.valid).toBe(false);
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("ambiguous single word → LLM called, returns VALID: Computer Science", async () => {
    (callLLM as jest.Mock).mockResolvedValue("VALID: Computer Science");
    // "engineering" is one word, no abbrev pattern, no sentence pattern → null → LLM
    const r = await validateCollect("engineering", "course");
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Computer Science");
  });

  test("ambiguous input → LLM called, returns INVALID", async () => {
    (callLLM as jest.Mock).mockResolvedValue("INVALID");
    const r = await validateCollect("engineering", "course");
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(r.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LLM output parsing
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — LLM output parsing", () => {
  beforeEach(() => jest.clearAllMocks());

  // "I was wondering" starts with 'I' + space, no name sentence pattern match → null → LLM
  test("LLM output parsing — 'VALID: Rohan Sharma' stored correctly", async () => {
    (callLLM as jest.Mock).mockResolvedValue("VALID: Rohan Sharma");
    const r = await validateCollect("I was wondering", "name");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("Rohan Sharma");
  });

  test("LLM output parsing — 'INVALID' → valid: false", async () => {
    (callLLM as jest.Mock).mockResolvedValue("INVALID");
    const r = await validateCollect("I was wondering", "name");
    expect(r.valid).toBe(false);
  });

  test("LLM network error → valid: false (safe default, no crash)", async () => {
    (callLLM as jest.Mock).mockRejectedValue(new Error("LLM unavailable"));
    const r = await validateCollect("I was wondering", "name");
    expect(r.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loan_amount natural language and word formats
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCollect — loan_amount natural language and word formats", () => {
  beforeEach(() => jest.clearAllMocks());

  test("'fifty lakh' → valid (local)", async () => {
    const r = await validateCollect("fifty lakh", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("50 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'fifty lakh rupees' → valid (local)", async () => {
    const r = await validateCollect("fifty lakh rupees", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("50 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'one crore' → valid (local)", async () => {
    const r = await validateCollect("one crore", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("1 crore");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'one and a half crore' → valid (local)", async () => {
    const r = await validateCollect("one and a half crore", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("1.5 crore");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'two crore' → valid (local)", async () => {
    const r = await validateCollect("two crore", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("2 crore");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'seventy five lakh' → valid (local)", async () => {
    const r = await validateCollect("seventy five lakh", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("75 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'twenty five lakh' → valid (local)", async () => {
    const r = await validateCollect("twenty five lakh", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("25 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'₹50 lakh' → valid (local)", async () => {
    const r = await validateCollect("₹50 lakh", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("50 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'50L' → valid (local)", async () => {
    const r = await validateCollect("50L", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("50 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'5000000' → valid (local)", async () => {
    const r = await validateCollect("5000000", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("5000000");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'around fifty lakh' → valid (local)", async () => {
    const r = await validateCollect("around fifty lakh", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("50 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'approximately twenty lakh' → valid (local)", async () => {
    const r = await validateCollect("approximately twenty lakh", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("20 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'my budget is one crore' → valid (local)", async () => {
    const r = await validateCollect("my budget is one crore", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("1 crore");
    expect(callLLM).not.toHaveBeenCalled();
  });

  test("'I need about fifty lakh' → valid (local)", async () => {
    const r = await validateCollect("I need about fifty lakh", "loan_amount");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("50 lakh");
    expect(callLLM).not.toHaveBeenCalled();
  });
});
