/**
 * Pure state management functions.
 *
 * All functions are stateless and return new state objects (immutable pattern).
 * No side effects — safe to use in tests without mocking.
 */

import { ConversationState, ChatMessage, MessageRole } from "./types";

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a brand-new conversation state at the flow's start node.
 */
export function createInitialState(startNode: string): ConversationState {
  return {
    currentNode: startNode,
    variables: {},
    history: [],
  };
}

// ─── Immutable Updates ────────────────────────────────────────────────────────

/**
 * Returns a new state with the current node updated.
 */
export function withCurrentNode(
  state: ConversationState,
  nodeId: string
): ConversationState {
  return { ...state, currentNode: nodeId };
}

/**
 * Returns a new state with an additional variable stored.
 */
export function withVariable(
  state: ConversationState,
  key: string,
  value: string
): ConversationState {
  return {
    ...state,
    variables: { ...state.variables, [key]: value },
  };
}

/**
 * Returns a new state with a message appended to history.
 */
export function withMessage(
  state: ConversationState,
  role: MessageRole,
  content: string
): ConversationState {
  const message: ChatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
  };
  return {
    ...state,
    history: [...state.history, message],
  };
}

/**
 * Returns a deep clone of the state (useful in tests to avoid mutation).
 */
export function cloneState(state: ConversationState): ConversationState {
  return {
    currentNode: state.currentNode,
    variables: { ...state.variables },
    history: state.history.map((m) => ({ ...m })),
  };
}
