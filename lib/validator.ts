/**
 * Input Validator — dedicated module for LLM-powered collect node validation.
 *
 * Exports:
 *   - validateInput()          → main entry point called by the flow engine
 *   - getDefaultRetryMessage() → fallback message when flow JSON omits retryMessage
 *
 * Strategy per expectedType:
 *   person_name → LLM validates & extracts the name
 *   email       → regex extraction first (no LLM call needed)
 *   course      → LLM extracts the course/program name
 *   phone       → regex first; LLM fallback if no pattern found
 *
 * LLM provider config (model, API key, base URL) lives entirely in lib/llm.ts.
 * This module imports the shared callLLM() helper to avoid duplicating config.
 *
 * SECURITY: Server-side only. Never import from client components.
 */

import { callLLM } from "./llm";
import type { ExpectedType, ValidationResult } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Matches a standard email address anywhere in a string. */
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

/**
 * Loose phone regex — matches common formats (with/without country code,
 * spaces, dashes, dots, parentheses).
 * Examples: +91-9876543210, (123) 456-7890, 9876543210
 */
const PHONE_REGEX =
  /(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)?\d{3,5}[\s\-.]?\d{4,6}/;

// ─── JSON Parser ──────────────────────────────────────────────────────────────

/**
 * Extracts the first JSON object from a raw LLM response string.
 * Handles cases where the model adds markdown fences or surrounding text.
 */
function parseValidationJSON(raw: string): ValidationResult {
  // Strip markdown code fences if present
  const stripped = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  // Find the first {...} block
  const match = stripped.match(/\{[\s\S]*?\}/);
  if (!match) {
    return { valid: false, reason: "Model did not return a recognisable JSON response." };
  }

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    if (typeof parsed.valid !== "boolean") {
      return { valid: false, reason: "Model returned unexpected JSON structure." };
    }

    return {
      valid: parsed.valid,
      value: typeof parsed.value === "string" ? parsed.value.trim() : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason.trim() : undefined,
    };
  } catch {
    return { valid: false, reason: "Could not parse model JSON response." };
  }
}

// ─── LLM Validation Call ─────────────────────────────────────────────────────

/**
 * Builds a validation prompt and calls the shared LLM client from lib/llm.ts.
 * All provider config (model, key, base URL) lives in llm.ts — not here.
 */
async function callLLMValidator(
  userMessage: string,
  expectedType: ExpectedType,
  question: string
): Promise<ValidationResult> {
  const typeDescriptions: Record<ExpectedType, string> = {
    person_name:
      "a real person's full name (first name, or first + last name). " +
      "Questions like 'Is it okay to share my name?' or unrelated sentences are NOT valid names.",
    email:
      "a valid email address in the format user@domain.tld. " +
      "Extract it even if embedded in a sentence like 'My email is user@example.com'.",
    course:
      "the name of an academic course or program (e.g., Computer Science, MBA, Data Science). " +
      "Extract the program name even if the user says 'I want Computer Science'.",
    phone:
      "a valid phone number, with or without country code. " +
      "Accept formats like +91-9876543210, (123) 456-7890, or 9876543210.",
  };

  const prompt =
    `You are a strict input validator for a college admission chatbot.\n\n` +
    `The user was asked: "${question}"\n` +
    `The user responded: "${userMessage}"\n\n` +
    `Validate whether the user's response contains ${typeDescriptions[expectedType]}\n\n` +
    `Rules:\n` +
    `1. If valid, extract and normalise the value.\n` +
    `2. If invalid, explain briefly why.\n` +
    `3. Reply with ONLY a single JSON object — no markdown, no explanation outside JSON.\n\n` +
    `Valid response format:\n` +
    `{"valid": true, "value": "<extracted normalised value>"}\n\n` +
    `Invalid response format:\n` +
    `{"valid": false, "reason": "<brief reason>"}`;

  let raw: string;
  try {
    raw = await callLLM([{ role: "user", content: prompt }]);
  } catch {
    return { valid: false, reason: "Validation service unavailable. Please try again." };
  }

  return parseValidationJSON(raw);
}

// ─── Default Retry Messages ────────────────────────────────────────────────────

/**
 * Generates a friendly, polite retry prompt when validation fails.
 * Used when the collect node does not define its own retryMessage.
 */
export function getDefaultRetryMessage(expectedType: ExpectedType): string {
  switch (expectedType) {
    case "person_name":
      return (
        "I'm sorry, I didn't quite catch your name. 😊\n\n" +
        "Could you please tell me your **full name**? (e.g., Rahul Sharma)"
      );
    case "email":
      return (
        "That doesn't look like a valid email address. 📧\n\n" +
        "Could you please provide a valid email? (e.g., yourname@example.com)"
      );
    case "course":
      return (
        "I didn't quite catch which course you're interested in. 🎓\n\n" +
        "Could you please name the **program or course**? " +
        "(e.g., Computer Science, Business Administration, Data Science)"
      );
    case "phone":
      return (
        "That doesn't look like a valid phone number. 📱\n\n" +
        "Could you please share your phone number? (e.g., +91 9876543210)"
      );
    default:
      return "I didn't quite understand that. Could you please try again?";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates and normalises user input for a collect node.
 *
 * Strategy:
 *   - email: regex extraction first (fast path, no LLM call)
 *   - phone: regex detection first; LLM fallback if no pattern found
 *   - person_name / course: LLM validation always
 *
 * @param userMessage  - Raw text the user submitted
 * @param expectedType - The semantic type the collect node expects
 * @param question     - The question that was asked (sent to LLM for context)
 * @returns            - ValidationResult with valid flag, extracted value, or reason
 */
export async function validateInput(
  userMessage: string,
  expectedType: ExpectedType,
  question: string
): Promise<ValidationResult> {
  const trimmed = userMessage.trim();

  if (!trimmed) {
    return { valid: false, reason: "User provided an empty response." };
  }

  switch (expectedType) {
    // ── Email: regex first (no LLM call needed) ───────────────────────────
    case "email": {
      const match = trimmed.match(EMAIL_REGEX);
      if (match) {
        return { valid: true, value: match[0].toLowerCase() };
      }
      // No email pattern found — LLM won't help; fail fast
      return {
        valid: false,
        reason:
          "No valid email address found. Please provide an address in the format user@domain.com.",
      };
    }

    // ── Phone: regex first, LLM fallback ─────────────────────────────────
    case "phone": {
      const match = trimmed.match(PHONE_REGEX);
      if (match) {
        return { valid: true, value: match[0].trim() };
      }
      return callLLMValidator(trimmed, expectedType, question);
    }

    // ── Name & Course: always LLM ─────────────────────────────────────────
    case "person_name":
    case "course":
      return callLLMValidator(trimmed, expectedType, question);

    default:
      // Exhaustiveness guard — should never reach here with strict types
      return { valid: false, reason: `Unknown expectedType: ${expectedType as string}` };
  }
}
