/**
 * Flow Engine — the core of the conversational agent.
 *
 * This engine implements the exact architecture described in the assignment:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Node Type   │  LLM?  │  Behaviour                                   │
 *   ├──────────────┼────────┼──────────────────────────────────────────────┤
 *   │  Prompt      │  No    │  Displays a message; {{variable}} substituted │
 *   │  Condition   │  YES   │  Classifies user reply → YES / NO / UNCLEAR  │
 *   │  Collect     │  No    │  Captures input; local validation; stays if   │
 *   │              │        │  invalid; advances when valid                 │
 *   └──────────────┴────────┴──────────────────────────────────────────────┘
 *
 * The engine is stateless — it receives ConversationState, computes the next
 * state, and returns it. The caller (API route) owns persistence.
 *
 * The engine never imports from the LLM provider directly. All LLM calls go
 * through lib/llm.ts so the engine remains provider-agnostic.
 */

import {
  Flow, FlowNode, ConversationState,
  PromptNode, CollectNode, ConditionNode,
} from "./types";
import { classifyIntent } from "./llm";
import { validateCollect } from "./collectValidator";
import { withCurrentNode, withVariable, withMessage } from "./state";

// ─── Variable Substitution ────────────────────────────────────────────────────

/**
 * Replaces all {{variable}} placeholders in a template string with stored values.
 *
 * @param template  - A string potentially containing {{key}} tokens
 * @param variables - Map of variable names to their values
 * @returns         - The interpolated string
 *
 * @example
 *   substituteVariables("Thanks {{name}} about {{budget}}", { name: "Rohan", budget: "30 lakhs" })
 *   // "Thanks Rohan about 30 lakhs"
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key] : match;
  });
}

// ─── Node Lookup ──────────────────────────────────────────────────────────────

/**
 * Builds a lookup map (id → node) for O(1) node access.
 */
export function buildNodeMap(flow: Flow): Map<string, FlowNode> {
  const map = new Map<string, FlowNode>();
  for (const node of flow.nodes) {
    map.set(node.id, node);
  }
  return map;
}

/**
 * Retrieves a node by ID and throws a descriptive error if not found.
 */
function getNode(map: Map<string, FlowNode>, id: string): FlowNode {
  const node = map.get(id);
  if (!node) {
    throw new Error(
      `Flow error: node "${id}" not found. Check the flow JSON for missing or misspelled IDs.`
    );
  }
  return node;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Displays the question / content of the next node as part of the current reply.
 * Called after transitioning into a collect or condition node so the user sees
 * what they're being asked before their next input.
 */
function sendNextNodeQuestion(
  nextNode: FlowNode,
  state: ConversationState,
  nodeMap: Map<string, FlowNode>
): Promise<{ reply: string; updatedState: ConversationState }> {
  if (nextNode.type === "prompt") {
    return processPromptNode(nextNode as PromptNode, state, nodeMap);
  }
  if (nextNode.type === "collect") {
    const q = substituteVariables((nextNode as CollectNode).question, state.variables);
    const updatedState = withMessage(state, "bot", q);
    return Promise.resolve({ reply: q, updatedState });
  }
  if (nextNode.type === "condition") {
    const q = substituteVariables((nextNode as ConditionNode).question, state.variables);
    const updatedState = withMessage(state, "bot", q);
    return Promise.resolve({ reply: q, updatedState });
  }
  throw new Error(`Unhandled next node type: ${(nextNode as FlowNode).id}`);
}

// ─── Node Processors ─────────────────────────────────────────────────────────

/**
 * Prompt node processor.
 *
 * Substitutes {{variables}}, appends the message to history, then
 * immediately chains to the next node so the user sees the follow-up
 * question in the same API response.
 *
 * Chaining:
 *   prompt → prompt    : combined into a single reply (multi-part greeting)
 *   prompt → collect   : shows prompt message + collect question
 *   prompt → condition : shows prompt message + condition question
 *   prompt → null      : terminal — conversation complete
 */
async function processPromptNode(
  node: PromptNode,
  state: ConversationState,
  nodeMap: Map<string, FlowNode>
): Promise<{ reply: string; updatedState: ConversationState }> {
  const message = substituteVariables(node.message, state.variables);
  let updatedState = withMessage(state, "bot", message);

  if (!node.next) {
    // Terminal prompt — conversation complete
    return { reply: message, updatedState };
  }

  const nextNode = getNode(nodeMap, node.next);
  updatedState = withCurrentNode(updatedState, nextNode.id);

  // Chain through consecutive prompt nodes (multi-part messages)
  if (nextNode.type === "prompt") {
    return processPromptNode(nextNode as PromptNode, updatedState, nodeMap);
  }

  // After a prompt, immediately show the next node's question.
  // This lets the user see what they need to respond to without a round-trip.
  const question = nextNode.type === "collect"
    ? substituteVariables((nextNode as CollectNode).question, updatedState.variables)
    : substituteVariables((nextNode as ConditionNode).question, updatedState.variables);

  const combinedReply = `${message}\n\n${question}`;
  updatedState = withMessage(
    withCurrentNode(state, nextNode.id),
    "bot",
    combinedReply
  );
  return { reply: combinedReply, updatedState };
}

/**
 * Collect node processor.
 *
 * Assignment specification:
 *   "Do not use the LLM to validate. Collect nodes capture information
 *    and keep asking until a valid value is received."
 *
 * Behaviour:
 *   VALID input   → normalise value → store → advance → show next node's question
 *   INVALID input → stay on this node → show retryMessage (or default)
 *
 * Validation is done by lib/collectValidator.ts using regex/heuristics only.
 *
 * Examples:
 *   "around 30 lakhs" → valid → budget = "30 lakhs" → advance
 *   "What?"           → invalid → stay → "I'm sorry, I didn't catch the loan amount..."
 *   "Rohan"           → valid → name = "Rohan"       → advance
 */
async function processCollectNode(
  node: CollectNode,
  userMessage: string,
  state: ConversationState,
  nodeMap: Map<string, FlowNode>
): Promise<{ reply: string; updatedState: ConversationState }> {
  const trimmed = userMessage.trim();
  const validation = await validateCollect(trimmed, node.expectedType, node.id);

  // ── Invalid input: stay on this node ─────────────────────────────────────
  if (!validation.valid) {
    const retryMsg = node.retryMessage
      ? substituteVariables(node.retryMessage, state.variables)
      : `I'm sorry, I didn't catch that.\n\n${node.question}`;
    const updatedState = withMessage(state, "bot", retryMsg);
    // currentNode is NOT advanced — same collect node handles the next message
    return { reply: retryMsg, updatedState };
  }

  // ── Valid input: store the normalised value and advance ───────────────────
  const storedValue = validation.value ?? trimmed;
  console.log(`[Stored] ${node.variable} = "${storedValue}"`);
  let updatedState = withVariable(state, node.variable, storedValue);

  const nextNode = getNode(nodeMap, node.next);
  updatedState = withCurrentNode(updatedState, nextNode.id);

  return sendNextNodeQuestion(nextNode, updatedState, nodeMap);
}

/**
 * Condition node processor — the ONLY place the LLM is called.
 *
 * Assignment specification:
 *   "The LLM classifies the user's latest reply into exactly one of:
 *    YES | NO | UNCLEAR — return only one word."
 *
 * UNCLEAR handling:
 *   If node.branches.UNCLEAR is specified → follow that branch
 *   Otherwise (default, per assignment) → re-ask the question politely and
 *   keep currentNode at this condition node
 *
 * YES / NO handling:
 *   Follow the matching branch from the flow JSON.
 */
async function processConditionNode(
  node: ConditionNode,
  userMessage: string,
  state: ConversationState,
  nodeMap: Map<string, FlowNode>
): Promise<{ reply: string; updatedState: ConversationState }> {
  const question = substituteVariables(node.question, state.variables);
  const intent = await classifyIntent(question, userMessage, node.id);

  console.log(`[FlowEngine] Condition node "${node.id}" → ${intent}`);

  // ── UNCLEAR: stay on current node, politely re-ask ────────────────────────
  if (intent === "UNCLEAR") {
    if (node.branches.UNCLEAR) {
      // Flow JSON specifies a custom UNCLEAR handler node
      const nextNode = getNode(nodeMap, node.branches.UNCLEAR);
      const updatedState = withCurrentNode(state, nextNode.id);
      return sendNextNodeQuestion(nextNode, updatedState, nodeMap);
    }
    // Default assignment behaviour: re-ask inline, stay on this node
    const reply = `I'm sorry, I didn't quite understand that.\n\n${question}`;
    const updatedState = withMessage(state, "bot", reply);
    // currentNode is NOT advanced
    return { reply, updatedState };
  }

  // ── YES / NO: follow the branch ───────────────────────────────────────────
  const nextNodeId = node.branches[intent as "YES" | "NO"];
  const nextNode = getNode(nodeMap, nextNodeId);
  const updatedState = withCurrentNode(state, nextNode.id);

  return sendNextNodeQuestion(nextNode, updatedState, nodeMap);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EngineResult {
  reply: string;
  updatedState: ConversationState;
}

/**
 * Main entry point for the flow engine.
 *
 * Processes the current node given the user's message and returns the
 * bot's reply along with the updated conversation state.
 *
 * First-turn (empty message):
 *   Displays the start node's content without consuming user input so the
 *   user sees the first question before they type anything.
 *
 * @param flow    - The parsed Flow JSON
 * @param state   - Current ConversationState
 * @param message - Raw user message (empty string on the very first turn)
 */
export async function processMessage(
  flow: Flow,
  state: ConversationState,
  message: string
): Promise<EngineResult> {
  const nodeMap = buildNodeMap(flow);
  const currentNode = getNode(nodeMap, state.currentNode);

  // ── First turn: display the starting node ────────────────────────────────
  if (!message || message.trim() === "") {
    if (currentNode.type === "prompt") {
      return processPromptNode(currentNode as PromptNode, state, nodeMap);
    }
    if (currentNode.type === "collect") {
      const q = substituteVariables((currentNode as CollectNode).question, state.variables);
      const updatedState = withMessage(state, "bot", q);
      return { reply: q, updatedState };
    }
    if (currentNode.type === "condition") {
      // Show the condition's question — currentNode stays here until user responds
      const q = substituteVariables((currentNode as ConditionNode).question, state.variables);
      const updatedState = withMessage(state, "bot", q);
      return { reply: q, updatedState };
    }
  }

  // ── Subsequent turns: append user message and process ────────────────────
  const stateWithUserMsg = withMessage(state, "user", message);

  switch (currentNode.type) {
    // A prompt node doesn't collect user input — advance to the next node
    case "prompt": {
      const promptNode = currentNode as PromptNode;
      if (promptNode.next) {
        const nextNode = getNode(nodeMap, promptNode.next);
        const advanced = withCurrentNode(stateWithUserMsg, nextNode.id);
        return sendNextNodeQuestion(nextNode, advanced, nodeMap);
      }
      // Terminal prompt
      return {
        reply: "The conversation has ended. Refresh the page to start again.",
        updatedState: stateWithUserMsg,
      };
    }

    case "collect":
      return processCollectNode(
        currentNode as CollectNode,
        message,
        stateWithUserMsg,
        nodeMap
      );

    case "condition":
      return processConditionNode(
        currentNode as ConditionNode,
        message,
        stateWithUserMsg,
        nodeMap
      );

    default:
      throw new Error(`Unknown node type: ${(currentNode as FlowNode).type}`);
  }
}
