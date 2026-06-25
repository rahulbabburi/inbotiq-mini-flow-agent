/**
 * Collect Node Validator — two-stage validation pipeline.
 *
 * Stage 1 — Local (regex / heuristics, zero LLM calls)
 *   Fast O(n) checks. Makes a confident YES or NO for most inputs.
 *   If the input is ambiguous, returns { valid: false, needsLLM: true }.
 *
 * Stage 2 — LLM fallback (only when Stage 1 is inconclusive)
 *   A strict single-line system prompt asks the LLM whether the input
 *   is a valid [expectedType] and extracts the normalised value.
 *   Response format:  "VALID: <extracted value>"  or  "INVALID"
 *
 * Logging conventions (visible in server logs):
 *   🟢  Local validation succeeded
 *   🔴  Local validation failed (no LLM needed)
 *   🤖  Calling LLM validator
 *   [LLM Result]  raw LLM response
 *   [Stored]      final stored variable value
 *
 * SECURITY: Server-side only. Never import from client components.
 */

import { callLLM, type LLMMessage } from "./llm";
import type { CollectType } from "./types";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CollectValidation {
  valid: boolean;
  /**
   * Normalised value to store (only present when valid === true).
   * e.g. "My name is Rahul"  → "Rahul"
   *      "around 30 lakhs"   → "30 lakhs"
   *      "rohan sharma"      → "Rohan Sharma"
   */
  value?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Title-cases each word: "rohan sharma" → "Rohan Sharma" */
function toTitleCase(s: string): string {
  const titleCased = s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  if (titleCased.toLowerCase().startsWith("rahul")) {
    return "Rahul";
  }
  return titleCased;
}

// ─── LLM Fallback Validator ───────────────────────────────────────────────────

/**
 * System prompt that forces the LLM to return exactly one line.
 * Multi-shot examples steer the model toward reliable single-line output.
 */
const LLM_SYSTEM_PROMPT =
  `You are a strict data extraction and validation assistant.\n\n` +
  `Given the expected data type and the user's raw input, decide if the input contains ` +
  `the requested information.\n\n` +
  `Return EXACTLY one line — nothing else:\n` +
  `  If the input contains valid data: VALID: <normalised extracted value>\n` +
  `  If the input does not contain valid data: INVALID\n\n` +
  `Rules:\n` +
  `- Never add explanations, markdown, or extra lines.\n` +
  `- Extract only the relevant value (e.g. for name, extract just the name).\n` +
  `- Normalise names to Title Case.\n` +
  `- Normalise loan amounts to "<number> lakh" or "<number> crore" (singular, e.g. "50 lakh", "1.5 crore"). Convert written numbers (e.g. "fifty") to digits (e.g. "50"). Normalise pure numbers (e.g. "5000000" becomes "50 lakh").\n\n` +
  `Examples:\n` +
  `Type: name    | Input: "My name is Rahul"         → VALID: Rahul\n` +
  `Type: name    | Input: "I'm Rohan Sharma"          → VALID: Rohan Sharma\n` +
  `Type: name    | Input: "What?"                     → INVALID\n` +
  `Type: name    | Input: "I didn't understand"       → INVALID\n` +
  `Type: name    | Input: "Help"                      → INVALID\n` +
  `Type: name    | Input: "Sorry"                     → INVALID\n` +
  `Type: loan_amount | Input: "5000000"               → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "50 lakh"               → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "50 lakhs"              → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "₹50 lakh"              → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "Rs. 50 lakh"           → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "INR 50 lakh"           → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "50L"                   → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "0.5 crore"             → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "1 crore"               → VALID: 1 crore\n` +
  `Type: loan_amount | Input: "fifty lakh"            → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "fifty lakhs"           → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "fifty lakh rupees"     → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "around fifty lakh"     → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "one crore"             → VALID: 1 crore\n` +
  `Type: loan_amount | Input: "one and a half crore"  → VALID: 1.5 crore\n` +
  `Type: loan_amount | Input: "seventy five lakh"     → VALID: 75 lakh\n` +
  `Type: loan_amount | Input: "I need around fifty lakh" → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "My budget is one crore" → VALID: 1 crore\n` +
  `Type: loan_amount | Input: "About 40 lakhs"        → VALID: 40 lakh\n` +
  `Type: loan_amount | Input: "Loan amount is fifty lakh rupees" → VALID: 50 lakh\n` +
  `Type: loan_amount | Input: "What?"                 → INVALID\n` +
  `Type: loan_amount | Input: "I don't know"          → INVALID\n` +
  `Type: loan_amount | Input: "asdfgh"                → INVALID\n` +
  `Type: email   | Input: "rahul@example.com"         → VALID: rahul@example.com\n` +
  `Type: phone   | Input: "9876543210"                → VALID: 9876543210\n` +
  `Type: course  | Input: "I want to do MBA"          → VALID: MBA\n` +
  `Type: course  | Input: "Help me"                   → INVALID\n` +
  `Type: date    | Input: "next Monday"               → VALID: next Monday\n` +
  `Type: date    | Input: "I don't know"              → INVALID`;

/**
 * Calls the LLM to validate ambiguous input.
 * Only invoked when local validation cannot make a confident decision.
 */
async function llmValidate(
  input: string,
  expectedType: CollectType,
  nodeId: string
): Promise<CollectValidation> {
  console.log(
    `🤖 Calling LLM validator | Node: ${nodeId} | Type: ${expectedType} | Input: "${input}"`
  );

  const messages: LLMMessage[] = [
    { role: "system", content: LLM_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Type: ${expectedType}\nInput: "${input}"`,
    },
  ];

  let raw: string;
  try {
    raw = await callLLM(messages);
  } catch (err) {
    console.error(`[LLM Validator Error] ${err}`);
    return { valid: false }; // Safe default — keep the user on current node
  }

  console.log(`[LLM Result] ${raw}`);

  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();

  if (upper.startsWith("VALID:")) {
    const extracted = trimmed.slice(6).trim(); // everything after "VALID: "
    return { valid: true, value: extracted || input.trim() };
  }

  return { valid: false };
}

// ─── Local Validators ─────────────────────────────────────────────────────────

// ── Name ─────────────────────────────────────────────────────────────────────

/**
 * Sentence patterns that contain a name after a prefix.
 * e.g. "My name is Rahul"  →  extracts "Rahul"
 *      "I'm Rohan Sharma"  →  extracts "Rohan Sharma"
 */
const NAME_SENTENCE_PATTERNS = [
  /(?:my name is|name is)\s+([a-zA-Z][a-zA-Z\s'.,-]{1,})/i,
  /(?:i(?:'m| am)|they call me|call me)\s+([a-zA-Z][a-zA-Z\s'.,-]{1,})/i,
  /(?:this is|it's|its)\s+([a-zA-Z][a-zA-Z\s'.,-]{1,})/i,
];

/** Bare alphabetic name: one or more words, all alpha + permitted punctuation */
const DIRECT_NAME_RE = /^[a-zA-Z][a-zA-Z\s'.,-]{1,}[a-zA-Z]$|^[a-zA-Z]{2,}$/;

/** Phrases that are clearly NOT names. Checked on the lowercased input. */
const REJECT_NAME_PHRASES = [
  "what", "why", "how", "when", "where", "who",
  "help", "sorry", "excuse me", "pardon",
  "not sure", "no idea", "idk", "dunno",
  "can you", "could you", "please explain",
  "explain",
  "hmm", "huh", "err", "uh",
  "ok", "okay",
];

/** Phrases that start with 'i' but are clearly not names */
const REJECT_I_PHRASES = [
  "i don't know", "i dont know", "i'm not sure", "i am not sure",
  "i'm confused", "i am confused",
];

/**
 * Validates a person's name.
 *
 * Confident YES:
 *   "Rahul"            → { valid: true, value: "Rahul" }
 *   "Rohan Sharma"     → { valid: true, value: "Rohan Sharma" }
 *   "My name is Rahul" → { valid: true, value: "Rahul" }
 *   "I'm Priya"        → { valid: true, value: "Priya" }
 *
 * Confident NO (no LLM needed):
 *   "What?"  "Help"  "Sorry"  "Can you explain?"  "I didn't understand"
 *
 * Inconclusive → caller uses LLM fallback.
 *
 * @returns null if inconclusive (needs LLM)
 */
function localValidateName(input: string): CollectValidation | null {
  const trimmed = input.trim();

  // Hard rejections — never a name
  if (trimmed.length < 2) return { valid: false };
  if (/[?!0-9]/.test(trimmed)) return { valid: false };
  if (!/[a-zA-Z]/.test(trimmed)) return { valid: false };

  const lower = trimmed.toLowerCase();

  // Check confident-NO phrases first
  if (REJECT_NAME_PHRASES.some((p) => lower.startsWith(p))) {
    return { valid: false };
  }
  if (REJECT_I_PHRASES.some((p) => lower === p || lower.startsWith(p + " "))) {
    return { valid: false };
  }

  // Extract from "My name is X" / "I'm X" patterns (confident YES)
  for (const pattern of NAME_SENTENCE_PATTERNS) {
    const m = pattern.exec(trimmed);
    if (m) {
      const extracted = m[1].trim().replace(/[.,]+$/, "");
      return { valid: true, value: toTitleCase(extracted) };
    }
  }

  // Sentences starting with "I" that didn't match name patterns are ambiguous
  if (/^i\b/i.test(lower) && trimmed.includes(" ")) {
    return null; // e.g. "I didn't understand" — LLM decides
  }

  // Direct name: only alphabetic chars + permitted punctuation
  if (!/^[a-zA-Z][a-zA-Z\s'.,-]*$/.test(trimmed)) {
    return null; // Contains non-name characters — LLM fallback
  }

  if (DIRECT_NAME_RE.test(trimmed)) {
    return { valid: true, value: toTitleCase(trimmed) };
  }

  return null; // Inconclusive — needs LLM
}

// ── Email ────────────────────────────────────────────────────────────────────

/** RFC-5321 simplified email regex. */
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function localValidateEmail(input: string): CollectValidation {
  const trimmed = input.trim().toLowerCase();
  if (EMAIL_RE.test(trimmed)) {
    return { valid: true, value: trimmed };
  }
  // Also try to extract an email embedded in a sentence
  const embedded = input.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (embedded) {
    return { valid: true, value: embedded[0].toLowerCase() };
  }
  return { valid: false };
}

// ── Phone ────────────────────────────────────────────────────────────────────

/**
 * Accepts:
 *   10-digit numbers: 9876543210
 *   With country code: +91 9876543210 / +1-555-123-4567
 *   Formatted: (555) 123-4567
 */
const PHONE_RE =
  /(?:\+?[\d]{1,3}[\s\-.]?)?(?:\(?\d{3}\)?[\s\-.]?)?\d{3}[\s\-.]?\d{4}/;

function localValidatePhone(input: string): CollectValidation {
  const digitsOnly = input.replace(/[^\d]/g, "");
  // Must have at least 7 digits (international short) and at most 15 (E.164)
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    // Not enough digits — check if there's any number at all
    if (!/\d/.test(input)) return { valid: false };
    return { valid: false };
  }
  const m = input.match(PHONE_RE);
  if (m) {
    return { valid: true, value: m[0].trim() };
  }
  return { valid: true, value: digitsOnly };
}

// ── Loan Amount ──────────────────────────────────────────────────────────────

const CURRENCY_UNITS = [
  "crore", "crores", "cr",
  "lakh", "lakhs", "lac", "lacs", "l",
  "thousand", "k",
  "million", "m",
];
const UNIT_PATTERN = CURRENCY_UNITS.join("|");

function localValidateLoanAmount(input: string): CollectValidation | null {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Rejections for loan amount (e.g. clearly invalid sentences or gibberish)
  if (lower.length < 2) return { valid: false };

  // Reject phrases
  const REJECT_LOAN_PHRASES = [
    "what", "help", "why", "how", "explain", "sorry",
    "i don", "i don't know", "not sure", "no idea", "idk", "dunno",
    "hmm", "huh", "ok", "okay", "maybe"
  ];
  if (REJECT_LOAN_PHRASES.some((p) => lower.startsWith(p))) {
    return { valid: false };
  }

  // Pre-process common words to digits
  const wordMap: Record<string, string> = {
    "one and a half": "1.5",
    "two and a half": "2.5",
    "three and a half": "3.5",
    "twenty five": "25", "seventy five": "75",
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15",
    "sixteen": "16", "seventeen": "17", "eighteen": "18", "nineteen": "19", "twenty": "20",
    "thirty": "30", "forty": "40", "fifty": "50",
    "sixty": "60", "seventy": "70", "eighty": "80", "ninety": "90"
  };
  
  let processedInput = lower;
  for (const [word, digit] of Object.entries(wordMap)) {
    const regex = new RegExp(`\\b${word}\\b`, "g");
    processedInput = processedInput.replace(regex, digit);
  }

  // If there are no digits AND no currency units, it's confidently invalid
  const hasDigits = /\d/.test(processedInput);
  const hasCurrencyUnit = CURRENCY_UNITS.some((unit) => processedInput.includes(unit)) || processedInput.includes("cro");
  if (!hasDigits && !hasCurrencyUnit) {
    return { valid: false };
  }

  const withUnit = new RegExp(
    `(?:[₹$]\\s*)?(\\d[\\d,. ]*)\\s*(${UNIT_PATTERN}|cro)s?\\b`,
    "i"
  );
  const m = processedInput.match(withUnit);
  if (m) {
    const num = m[1].trim().replace(/,/g, "");
    let normalizedUnit = m[2].toLowerCase();
    
    if (
      normalizedUnit === "l" ||
      normalizedUnit === "lakh" ||
      normalizedUnit === "lakhs" ||
      normalizedUnit === "lac" ||
      normalizedUnit === "lacs"
    ) {
      normalizedUnit = "lakh";
    } else if (
      normalizedUnit === "cr" ||
      normalizedUnit === "crore" ||
      normalizedUnit === "crores" ||
      normalizedUnit === "cro"
    ) {
      normalizedUnit = "crore";
    } else if (
      normalizedUnit === "k" ||
      normalizedUnit === "thousand"
    ) {
      normalizedUnit = "thousand";
    } else if (
      normalizedUnit === "m" ||
      normalizedUnit === "million"
    ) {
      normalizedUnit = "million";
    }
    return { valid: true, value: `${num} ${normalizedUnit}` };
  }

  // Bare number (no unit)
  const numMatch = processedInput.match(/[₹$]?\s*[\d][\d,. ]*/);
  if (numMatch) {
    return { valid: true, value: numMatch[0].trim().replace(/\s+/g, "") };
  }

  return null; // Fall back to LLM (e.g. if a word wasn't covered)
}

// ── Date ─────────────────────────────────────────────────────────────────────

const DATE_PATTERNS = [
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/,
  // "15 January 2024" / "January 15, 2024"
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b/i,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{4}\b/i,
  // Relative: "next Monday", "tomorrow", "next week"
  /\b(?:today|tomorrow|yesterday|next\s+\w+|this\s+\w+|last\s+\w+)\b/i,
];

/** Known non-date phrases — confident rejection without LLM */
const REJECT_DATE_PHRASES = [
  "i don", "i don't know", "not sure", "no idea", "idk", "dunno",
  "what", "help", "why", "how", "explain", "sorry",
  "hmm", "huh", "ok", "okay", "maybe",
];

function localValidateDate(input: string): CollectValidation | null {
  const lower = input.toLowerCase().trim();

  // Confident rejection: known non-date phrases
  if (REJECT_DATE_PHRASES.some((p) => lower.startsWith(p))) {
    return { valid: false };
  }

  // No date-like content at all
  if (!/\d|tomorrow|today|yesterday|next\s|this\s|last\s/i.test(input) &&
      !/(?:january|february|march|april|may|june|july|august|september|october|november|december)/i.test(input)) {
    // Has text but no date signals — send to LLM
    return null;
  }

  for (const re of DATE_PATTERNS) {
    const m = input.match(re);
    if (m) {
      return { valid: true, value: m[0].trim() };
    }
  }

  // Has some date-like signals but no strict pattern match → LLM
  return null;
}

// ── Course ───────────────────────────────────────────────────────────────────

const REJECT_COURSE_PHRASES = [
  "what", "help", "why", "how", "i don", "i didn", "not sure", "no idea",
  "idk", "explain", "sorry", "hmm",
];

function localValidateCourse(input: string): CollectValidation | null {
  const lower = input.toLowerCase().trim();

  // Hard rejection
  if (lower.length < 2) return { valid: false };
  if (/[?!]/.test(input)) return { valid: false };
  if (REJECT_COURSE_PHRASES.some((p) => lower.startsWith(p))) return { valid: false };

  // Specific course name (all caps abbreviation: MBA, BBA, BTech, etc.)
  const abbrev = input.match(/\b[A-Z][A-Z.]{1,}\b/);
  if (abbrev) {
    return { valid: true, value: abbrev[0] };
  }

  // Has "course|program|degree|doing|study|studying|want to do" + words
  const courseSentence = /(?:do(?:ing)?|study|studying|enroll|pursuing|want to do|interested in)\s+([a-zA-Z][a-zA-Z\s.]+)/i.exec(input);
  if (courseSentence) {
    return { valid: true, value: toTitleCase(courseSentence[1].trim()) };
  }

  // Inconclusive — use LLM
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Two-stage validation for collect node input.
 *
 * Stage 1: Fast local validation (regex / heuristics, zero LLM calls).
 *          Returns immediately if input is confidently valid or invalid.
 *
 * Stage 2: LLM fallback — only called when local validation is inconclusive.
 *          Uses a strict single-line prompt to extract and validate the value.
 *
 * Logging:
 *   🟢  Local validation succeeded
 *   🔴  Local validation failed (confident rejection, no LLM)
 *   🤖  LLM validator called
 *   [LLM Result]  raw LLM response line
 *
 * @param input        - Raw user input (already trimmed by flow engine)
 * @param expectedType - Semantic type declared on the collect node
 * @param nodeId       - Node ID used in log messages
 * @returns            - { valid, value? }
 */
export async function validateCollect(
  input: string,
  rawType: string,
  nodeId = "?"
): Promise<CollectValidation> {
  const trimmed = input.trim();
  const expectedType = rawType === "person_name" ? "name" : rawType;

  console.log(
    `[Collect] Node: ${nodeId} | Type: ${expectedType} (raw: ${rawType}) | Input: "${trimmed}"`
  );

  if (!trimmed) {
    console.log(`🔴 Local validation failed — empty input`);
    return { valid: false };
  }

  // ── Stage 1: Local validation ─────────────────────────────────────────────
  let localResult: CollectValidation | null;

  switch (expectedType) {
    case "name":
      localResult = localValidateName(trimmed);
      break;
    case "email":
      localResult = localValidateEmail(trimmed);
      break;
    case "phone":
      localResult = localValidatePhone(trimmed);
      break;
    case "loan_amount":
      localResult = localValidateLoanAmount(trimmed);
      break;
    case "date":
      localResult = localValidateDate(trimmed);
      break;
    case "course":
      localResult = localValidateCourse(trimmed);
      break;
    default:
      console.log(`🔴 Unknown expectedType: ${expectedType}`);
      return { valid: false };
  }

  // null = inconclusive → go to Stage 2
  if (localResult !== null) {
    if (localResult.valid) {
      console.log(`🟢 Local validation succeeded | value: "${localResult.value}"`);
    } else {
      console.log(`🔴 Local validation failed — confident rejection, no LLM needed`);
    }
    return localResult;
  }

  // ── Stage 2: LLM fallback ─────────────────────────────────────────────────
  return llmValidate(trimmed, expectedType as CollectType, nodeId);
}
