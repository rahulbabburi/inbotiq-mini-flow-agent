/**
 * Shared TypeScript types for the Mini Conversational Flow Agent.
 * Imported across lib/, app/api/, and components/.
 */

// ─── Flow Definition ────────────────────────────────────────────────────────

/** Sends a bot message without waiting for user input. */
export interface PromptNode {
  id: string;
  type: "prompt";
  message: string;
  /** ID of the next node, or null if this is a terminal node. */
  next: string | null;
}

/**
 * The semantic type of value a collect node expects.
 * Drives the two-stage validation in lib/collectValidator.ts:
 *   Stage 1 — local regex / heuristics (zero LLM calls)
 *   Stage 2 — LLM fallback when local validation is inconclusive
 */
export type CollectType =
  | "name"        // Person's full name
  | "email"       // Email address
  | "phone"       // Phone number
  | "loan_amount" // Monetary loan amount ("30 lakhs", "₹25,00,000")
  | "date"        // Any date expression ("15 Jan 2024", "next Monday")
  | "course";     // Academic / professional course name

/**
 * Collects the user's response, validates it locally (no LLM), and stores it.
 *
 * If the input passes validation the normalised value is stored and the flow
 * advances to the next node. If validation fails the engine stays on this node
 * and shows retryMessage (or a sensible default).
 */
export interface CollectNode {
  id: string;
  type: "collect";
  /** The question displayed to prompt the user for input. */
  question: string;
  /** The key under which the normalised value is saved in ConversationState.variables */
  variable: string;
  /**
   * Declares the semantic type of the expected value.
   * The collect validator uses this to pick the right rule (regex/heuristics).
   * No LLM is invoked.
   */
  expectedType: CollectType;
  /**
   * Optional custom message shown when validation fails.
   * Supports {{variable}} substitution.
   * Falls back to a sensible default if omitted.
   */
  retryMessage?: string;
  next: string;
}

/** Uses the LLM (via lib/llm.ts) to classify user intent and branches accordingly. */
export interface ConditionNode {
  id: string;
  type: "condition";
  question: string;
  /**
   * Branch targets.
   * - YES     → user agreed / confirmed
   * - NO      → user declined
   * - UNCLEAR → optional; if omitted the engine re-asks the same question
   *             politely and stays on this node automatically
   */
  branches: {
    YES: string;
    NO: string;
    UNCLEAR?: string;
  };
}


export type FlowNode = PromptNode | CollectNode | ConditionNode;

export interface Flow {
  nodes: FlowNode[];
  startNode: string;
}

// ─── Conversation State ──────────────────────────────────────────────────────

/**
 * Fully serialisable state that travels in every API request/response.
 * No session storage needed — the client owns the state.
 */
export interface ConversationState {
  /** ID of the node currently being processed. */
  currentNode: string;
  /** Key-value store populated by collect nodes. */
  variables: Record<string, string>;
  /** Ordered list of messages shown in the chat UI. */
  history: ChatMessage[];
}

// ─── Chat Messages ───────────────────────────────────────────────────────────

export type MessageRole = "user" | "bot";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

// ─── API Contract ────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  conversationState: ConversationState;
}

export interface ChatResponse {
  reply: string;
  updatedState: ConversationState;
}

// ─── LLM Service ─────────────────────────────────────────────────────────────

/** Valid intent classifications returned by Gemini. */
export type IntentClassification = "YES" | "NO" | "UNCLEAR";

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * The semantic type of a value a collect node expects.
 * Drives the validation strategy in lib/validator.ts.
 */
export type ExpectedType = "person_name" | "email" | "phone" | "course";

/**
 * Result returned by validateInput().
 * - valid: true  → `value` holds the normalised string to store
 * - valid: false → `reason` explains why (used to generate the retry message)
 */
export interface ValidationResult {
  valid: boolean;
  /** The cleaned / extracted value to store. Only present when valid === true. */
  value?: string;
  /** Human-readable explanation for why the input was rejected. */
  reason?: string;
}
