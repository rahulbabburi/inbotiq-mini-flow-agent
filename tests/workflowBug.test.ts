/**
 * Specific verification tests to satisfy user-requested checklist.
 * Run using jest to verify state machine correctness, state persistence,
 * branching, and variable substitution.
 */

jest.mock("../lib/llm", () => ({
  classifyIntent: jest.fn(),
  generatePrompt: jest.fn(),
  callLLM: jest.fn(),
}));

jest.mock("../lib/collectValidator", () => ({
  validateCollect: jest.fn(),
}));

import { classifyIntent } from "../lib/llm";
import { validateCollect } from "../lib/collectValidator";
import { processMessage } from "../lib/flowEngine";
import { createInitialState } from "../lib/state";
import type { Flow, ConversationState } from "../lib/types";

const testFlow: Flow = {
  startNode: "check_person",
  nodes: [
    {
      id: "check_person",
      type: "condition",
      question: "Hi! Are you the right person?",
      branches: {
        YES: "ask_budget",
        NO: "goodbye",
      },
    },
    {
      id: "ask_budget",
      type: "collect",
      question: "Roughly what loan amount?",
      variable: "loanAmount",
      expectedType: "loan_amount",
      retryMessage: "Invalid loan amount.",
      next: "ask_name",
    },
    {
      id: "ask_name",
      type: "collect",
      question: "What is your name?",
      variable: "name",
      expectedType: "name",
      retryMessage: "Invalid name.",
      next: "confirmation",
    },
    {
      id: "confirmation",
      type: "prompt",
      message: "Thanks {{name}} — someone will call you about your {{loanAmount}} enquiry shortly.",
      next: null,
    },
    {
      id: "goodbye",
      type: "prompt",
      message: "Goodbye!",
      next: null,
    },
  ],
};

describe("JSON Flow Engine Bug Verification Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("1. Happy path & State persistence & Branching & Variable substitution & Conversation completion", async () => {
    // Start at initial state
    let state = createInitialState(testFlow.startNode);
    expect(state.currentNode).toBe("check_person");
    expect(state.variables).toEqual({});

    // YES branch
    (classifyIntent as jest.Mock).mockResolvedValue("YES");
    let result = await processMessage(testFlow, state, "yes");
    state = result.updatedState;
    expect(state.currentNode).toBe("ask_budget");

    // Valid budget input
    (validateCollect as jest.Mock).mockResolvedValue({ valid: true, value: "40 lakhs" });
    result = await processMessage(testFlow, state, "40 lakhs");
    state = result.updatedState;
    
    // Assert variables saved and previous state persisted
    expect(state.variables).toEqual({ loanAmount: "40 lakhs" });
    expect(state.currentNode).toBe("ask_name");

    // Valid name input
    (validateCollect as jest.Mock).mockResolvedValue({ valid: true, value: "Rahul" });
    result = await processMessage(testFlow, state, "Rahul");
    state = result.updatedState;
    
    // Assert variables accumulated (state persistence)
    expect(state.variables).toEqual({ loanAmount: "40 lakhs", name: "Rahul" });
    expect(state.currentNode).toBe("confirmation");

    // Prompt evaluation & variable substitution & conversation completion
    result = await processMessage(testFlow, state, "");
    expect(result.reply).toBe("Thanks Rahul — someone will call you about your 40 lakhs enquiry shortly.");
  });

  test("2. Invalid budget & Retry without restarting", async () => {
    let state = createInitialState(testFlow.startNode);
    (classifyIntent as jest.Mock).mockResolvedValue("YES");
    let result = await processMessage(testFlow, state, "yes");
    state = result.updatedState;

    // Invalid budget attempt
    (validateCollect as jest.Mock).mockResolvedValue({ valid: false });
    result = await processMessage(testFlow, state, "invalid-amount");
    state = result.updatedState;

    // Assert stayed on same collect node, variables not cleared
    expect(state.currentNode).toBe("ask_budget");
    expect(state.variables).toEqual({});
    expect(result.reply).toContain("Invalid loan amount");

    // Valid attempt afterwards
    (validateCollect as jest.Mock).mockResolvedValue({ valid: true, value: "40 lakhs" });
    result = await processMessage(testFlow, state, "40 lakhs");
    state = result.updatedState;
    expect(state.currentNode).toBe("ask_name");
    expect(state.variables).toEqual({ loanAmount: "40 lakhs" });
  });

  test("3. Invalid name", async () => {
    let state = {
      currentNode: "ask_name",
      variables: { loanAmount: "40 lakhs" },
      history: [],
    };

    // Invalid name attempt
    (validateCollect as jest.Mock).mockResolvedValue({ valid: false });
    let result = await processMessage(testFlow, state, "invalid-name");
    state = result.updatedState;

    // Assert stayed on same collect node, variables preserved
    expect(state.currentNode).toBe("ask_name");
    expect(state.variables).toEqual({ loanAmount: "40 lakhs" });
    expect(result.reply).toContain("Invalid name");
  });
});
