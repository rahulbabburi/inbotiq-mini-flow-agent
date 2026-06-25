/**
 * Tests for the Flow Engine — matching the assignment specification exactly.
 *
 * Strategy:
 *   - lib/llm is mocked (classifyIntent for condition nodes)
 *   - lib/collectValidator is mocked so engine tests focus on flow routing,
 *     not validation internals (which are tested in collectValidator.test.ts)
 *
 * Required tests (assignment spec):
 *   1. YES  → ask_budget
 *   2. NO   → goodbye
 *   3. UNCLEAR → repeat question (stay on same node)
 *   4. Budget collected → next node (ask_name)
 *   5. Invalid budget  → remain on current node
 *   6. Variable substitution: {{name}} and {{budget}} render correctly
 *
 * Additional:
 *   - Initial display (empty message)
 *   - Full happy-path end-to-end
 *   - Name: valid / invalid / sentence-form ("My name is Rahul")
 *   - Email: valid / invalid
 *   - Phone: valid / invalid
 *   - UNCLEAR retries then succeeds
 *   - LLM NOT called for collect/prompt nodes
 */

import { substituteVariables, buildNodeMap, processMessage } from "../lib/flowEngine";
import { createInitialState } from "../lib/state";
import type { Flow, ConversationState } from "../lib/types";

// ─── Mock lib/llm ─────────────────────────────────────────────────────────────
jest.mock("../lib/llm", () => ({
  classifyIntent: jest.fn(),
  generatePrompt: jest.fn(),
  callLLM: jest.fn(),
}));

// ─── Mock lib/collectValidator ─────────────────────────────────────────────────
// Engine tests assert flow-routing behaviour only. Validation internals
// (regex rules, LLM fallback parsing) are covered in collectValidator.test.ts.
jest.mock("../lib/collectValidator", () => ({
  validateCollect: jest.fn(),
}));

import { classifyIntent } from "../lib/llm";
import { validateCollect } from "../lib/collectValidator";

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Make validateCollect resolve as valid with a given normalised value */
function mockValid(value: string) {
  (validateCollect as jest.Mock).mockResolvedValueOnce({ valid: true, value });
}

/** Make validateCollect resolve as invalid */
function mockInvalid() {
  (validateCollect as jest.Mock).mockResolvedValueOnce({ valid: false });
}

// ─── Sample flow — mirrors the assignment example ─────────────────────────────
const sampleFlow: Flow = {
  startNode: "check_person",
  nodes: [
    {
      id: "check_person",
      type: "condition",
      question: "Hi! Are you the right person to talk to about your home loan enquiry?",
      branches: {
        YES: "ask_budget",
        NO: "goodbye",
        // No UNCLEAR branch — engine re-asks inline per assignment spec
      },
    },
    {
      id: "ask_budget",
      type: "collect",
      question: "Great! Roughly what loan amount are you looking for?",
      variable: "budget",
      expectedType: "loan_amount",
      retryMessage:
        "I'm sorry, I didn't catch the loan amount. " +
        "Could you tell me approximately how much loan you're looking for?",
      next: "ask_name",
    },
    {
      id: "ask_name",
      type: "collect",
      question: "Perfect. And what's the best name to put on the file?",
      variable: "name",
      expectedType: "name",
      retryMessage:
        "I'm sorry, I didn't catch your name. Could you please tell me your full name?",
      next: "confirmation",
    },
    {
      id: "confirmation",
      type: "prompt",
      message: "Thanks {{name}} — someone will call you about your {{budget}} enquiry shortly.",
      next: null,
    },
    {
      id: "goodbye",
      type: "prompt",
      message: "No problem! Have a great day. 👋",
      next: null,
    },
  ],
};

// ─── Extended flow with email and phone nodes ─────────────────────────────────
const extendedFlow: Flow = {
  startNode: "ask_email",
  nodes: [
    {
      id: "ask_email",
      type: "collect",
      question: "What is your email address?",
      variable: "email",
      expectedType: "email",
      retryMessage: "Please enter a valid email address (e.g. you@example.com).",
      next: "ask_phone",
    },
    {
      id: "ask_phone",
      type: "collect",
      question: "What is your phone number?",
      variable: "phone",
      expectedType: "phone",
      retryMessage: "Please enter a valid 10-digit phone number.",
      next: "done",
    },
    {
      id: "done",
      type: "prompt",
      message: "Got it — we'll reach you at {{email}} or {{phone}}.",
      next: null,
    },
  ],
};

// ─── State factory ────────────────────────────────────────────────────────────

function makeState(
  currentNode: string,
  variables: Record<string, string> = {}
): ConversationState {
  return { currentNode, variables, history: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// substituteVariables
// ─────────────────────────────────────────────────────────────────────────────
describe("substituteVariables", () => {
  test("Test 6 — replaces {{name}} placeholder", () => {
    expect(substituteVariables("Hello {{name}}", { name: "Rahul" })).toBe("Hello Rahul");
  });

  test("replaces both {{name}} and {{budget}}", () => {
    expect(
      substituteVariables(
        "Thanks {{name}} — someone will call you about your {{budget}} enquiry shortly.",
        { name: "Rohan", budget: "30 lakhs" }
      )
    ).toBe("Thanks Rohan — someone will call you about your 30 lakhs enquiry shortly.");
  });

  test("leaves unknown {{placeholders}} unchanged", () => {
    expect(substituteVariables("Hello {{unknown}}", { name: "Rahul" })).toBe(
      "Hello {{unknown}}"
    );
  });

  test("returns template unchanged when variables map is empty", () => {
    expect(substituteVariables("Hello World", {})).toBe("Hello World");
  });

  test("returns template unchanged when no placeholders present", () => {
    expect(substituteVariables("No placeholders here", { name: "Rahul" })).toBe(
      "No placeholders here"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildNodeMap
// ─────────────────────────────────────────────────────────────────────────────
describe("buildNodeMap", () => {
  test("builds a map with all expected node IDs", () => {
    const map = buildNodeMap(sampleFlow);
    expect(map.has("check_person")).toBe(true);
    expect(map.has("ask_budget")).toBe(true);
    expect(map.has("ask_name")).toBe(true);
    expect(map.has("confirmation")).toBe(true);
    expect(map.has("goodbye")).toBe(true);
  });

  test("resolves node by ID with correct type", () => {
    const map = buildNodeMap(sampleFlow);
    expect(map.get("check_person")?.type).toBe("condition");
    expect(map.get("ask_budget")?.type).toBe("collect");
    expect(map.get("confirmation")?.type).toBe("prompt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Initial display (empty message)
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — initial display (empty message)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("condition start node: shows question without calling LLM", async () => {
    const { reply, updatedState } = await processMessage(
      sampleFlow,
      makeState("check_person"),
      ""
    );
    expect(classifyIntent).not.toHaveBeenCalled();
    expect(validateCollect).not.toHaveBeenCalled();
    expect(reply).toContain("Are you the right person");
    expect(updatedState.currentNode).toBe("check_person");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Required Test 1: YES → ask_budget
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — condition node: YES branch", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Test 1 — YES: transitions to ask_budget, shows loan question", async () => {
    (classifyIntent as jest.Mock).mockResolvedValue("YES");

    const { reply, updatedState } = await processMessage(
      sampleFlow,
      makeState("check_person"),
      "yes that's me"
    );

    expect(classifyIntent).toHaveBeenCalledWith(
      "Hi! Are you the right person to talk to about your home loan enquiry?",
      "yes that's me",
      "check_person"
    );
    expect(updatedState.currentNode).toBe("ask_budget");
    expect(reply).toContain("loan amount");
  });

  test("common affirmatives classified YES → all advance to ask_budget", async () => {
    for (const input of ["yes", "yeah", "sure", "ok", "absolutely"]) {
      (classifyIntent as jest.Mock).mockResolvedValue("YES");
      const { updatedState } = await processMessage(
        sampleFlow,
        makeState("check_person"),
        input
      );
      expect(updatedState.currentNode).toBe("ask_budget");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Required Test 2: NO → goodbye
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — condition node: NO branch", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Test 2 — NO: transitions to goodbye, shows goodbye message", async () => {
    (classifyIntent as jest.Mock).mockResolvedValue("NO");

    const { reply, updatedState } = await processMessage(
      sampleFlow,
      makeState("check_person"),
      "No, wrong person"
    );

    expect(updatedState.currentNode).toBe("goodbye");
    expect(reply.toLowerCase()).toContain("great day");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Required Test 3: UNCLEAR → repeat current question (stay on same node)
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — condition node: UNCLEAR stays on same node", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Test 3 — UNCLEAR: reply contains apology + original question, node unchanged", async () => {
    (classifyIntent as jest.Mock).mockResolvedValue("UNCLEAR");

    const { reply, updatedState } = await processMessage(
      sampleFlow,
      makeState("check_person"),
      "maybe"
    );

    expect(reply).toContain("didn't quite understand");
    expect(reply).toContain("Are you the right person");
    expect(updatedState.currentNode).toBe("check_person"); // NOT advanced
  });

  test("UNCLEAR — LLM is called exactly once for the classification", async () => {
    (classifyIntent as jest.Mock).mockResolvedValue("UNCLEAR");
    await processMessage(sampleFlow, makeState("check_person"), "what?");
    expect(classifyIntent).toHaveBeenCalledTimes(1);
  });

  test("UNCLEAR then YES — second message advances correctly", async () => {
    (classifyIntent as jest.Mock).mockResolvedValue("UNCLEAR");
    const { updatedState: after1 } = await processMessage(
      sampleFlow,
      makeState("check_person"),
      "maybe"
    );
    expect(after1.currentNode).toBe("check_person");

    (classifyIntent as jest.Mock).mockResolvedValue("YES");
    const { updatedState: after2 } = await processMessage(
      sampleFlow,
      after1,
      "yes that's me"
    );
    expect(after2.currentNode).toBe("ask_budget");
  });

  test("multiple UNCLEAR responses keep re-asking each time", async () => {
    (classifyIntent as jest.Mock).mockResolvedValue("UNCLEAR");
    let state = makeState("check_person");

    for (let i = 0; i < 3; i++) {
      const { reply, updatedState } = await processMessage(sampleFlow, state, "hmm");
      expect(updatedState.currentNode).toBe("check_person");
      expect(reply).toContain("Are you the right person");
      state = updatedState;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Required Test 4: Budget collected → next node (ask_name)
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — collect node: valid budget advances", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Test 4 — valid budget: stored normalised, advances to ask_name", async () => {
    mockValid("30 lakhs");

    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_budget"),
      "around 30 lakhs"
    );

    expect(classifyIntent).not.toHaveBeenCalled(); // LLM never for collect
    expect(validateCollect).toHaveBeenCalledWith(
      "around 30 lakhs",
      "loan_amount",
      "ask_budget"
    );
    expect(updatedState.variables.budget).toBe("30 lakhs");
    expect(updatedState.currentNode).toBe("ask_name");
  });

  test("'50 crores' → budget = '50 crores', advance", async () => {
    mockValid("50 crores");
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_budget"),
      "50 crores"
    );
    expect(updatedState.variables.budget).toBe("50 crores");
    expect(updatedState.currentNode).toBe("ask_name");
  });

  test("after valid budget, reply shows ask_name question", async () => {
    mockValid("30 lakhs");
    const { reply } = await processMessage(
      sampleFlow,
      makeState("ask_budget"),
      "30 lakhs"
    );
    expect(reply).toContain("name to put on the file");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Required Test 5: Invalid budget → remain on current node
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — collect node: invalid budget stays on same node", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Test 5a — invalid input: stays on ask_budget, shows retry message", async () => {
    mockInvalid();

    const { reply, updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_budget"),
      "What?"
    );

    expect(updatedState.currentNode).toBe("ask_budget"); // NOT advanced
    expect(updatedState.variables.budget).toBeUndefined(); // NOT stored
    expect(reply).toContain("didn't catch the loan amount");
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  test("Test 5b — 'I don't know' → stays on ask_budget", async () => {
    mockInvalid();
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_budget"),
      "I don't know"
    );
    expect(updatedState.currentNode).toBe("ask_budget");
    expect(updatedState.variables.budget).toBeUndefined();
  });

  test("Test 5c — invalid then valid → first stays, second advances", async () => {
    // First: invalid
    mockInvalid();
    const { updatedState: after1 } = await processMessage(
      sampleFlow,
      makeState("ask_budget"),
      "What?"
    );
    expect(after1.currentNode).toBe("ask_budget");

    // Second: valid
    mockValid("30 lakhs");
    const { updatedState: after2 } = await processMessage(
      sampleFlow,
      after1,
      "30 lakhs"
    );
    expect(after2.variables.budget).toBe("30 lakhs");
    expect(after2.currentNode).toBe("ask_name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Name collect node — valid / invalid / sentence-form
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — collect node: name validation", () => {
  beforeEach(() => jest.clearAllMocks());

  test("valid name 'Rohan' → stored, advances to confirmation", async () => {
    mockValid("Rohan");
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_name", { budget: "30 lakhs" }),
      "Rohan"
    );
    expect(updatedState.variables.name).toBe("Rohan");
    expect(updatedState.currentNode).toBe("confirmation");
  });

  test("'rohan sharma' → normalised to 'Rohan Sharma'", async () => {
    mockValid("Rohan Sharma");
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_name", { budget: "30 lakhs" }),
      "rohan sharma"
    );
    expect(updatedState.variables.name).toBe("Rohan Sharma");
  });

  test("'My name is Rahul' → extracts 'Rahul', advances", async () => {
    mockValid("Rahul");
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_name", { budget: "30 lakhs" }),
      "My name is Rahul"
    );
    expect(updatedState.variables.name).toBe("Rahul");
    expect(updatedState.currentNode).toBe("confirmation");
  });

  test("invalid name 'What?' → stays on ask_name, shows retry", async () => {
    mockInvalid();
    const { reply, updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_name", { budget: "30 lakhs" }),
      "What?"
    );
    expect(updatedState.currentNode).toBe("ask_name");
    expect(updatedState.variables.name).toBeUndefined();
    expect(reply).toContain("didn't catch your name");
  });

  test("invalid name 'I don't understand' → stays on ask_name", async () => {
    mockInvalid();
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_name", { budget: "30 lakhs" }),
      "I don't understand"
    );
    expect(updatedState.currentNode).toBe("ask_name");
    expect(updatedState.variables.name).toBeUndefined();
  });

  test("invalid name 'Help' → stays on ask_name", async () => {
    mockInvalid();
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("ask_name", { budget: "30 lakhs" }),
      "Help"
    );
    expect(updatedState.currentNode).toBe("ask_name");
    expect(updatedState.variables.name).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Email and Phone collect nodes (extended flow)
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — collect node: email validation", () => {
  beforeEach(() => jest.clearAllMocks());

  test("valid email → stored, advances to ask_phone", async () => {
    mockValid("rahul@example.com");
    const { updatedState } = await processMessage(
      extendedFlow,
      makeState("ask_email"),
      "rahul@example.com"
    );
    expect(updatedState.variables.email).toBe("rahul@example.com");
    expect(updatedState.currentNode).toBe("ask_phone");
  });

  test("invalid email 'What?' → stays on ask_email, shows retry", async () => {
    mockInvalid();
    const { reply, updatedState } = await processMessage(
      extendedFlow,
      makeState("ask_email"),
      "What?"
    );
    expect(updatedState.currentNode).toBe("ask_email");
    expect(updatedState.variables.email).toBeUndefined();
    expect(reply).toContain("valid email address");
  });

  test("invalid email 'not an email' → stays on ask_email", async () => {
    mockInvalid();
    const { updatedState } = await processMessage(
      extendedFlow,
      makeState("ask_email"),
      "not an email"
    );
    expect(updatedState.currentNode).toBe("ask_email");
    expect(updatedState.variables.email).toBeUndefined();
  });
});

describe("processMessage — collect node: phone validation", () => {
  beforeEach(() => jest.clearAllMocks());

  test("valid phone → stored, advances to done", async () => {
    mockValid("9876543210");
    const { updatedState } = await processMessage(
      extendedFlow,
      makeState("ask_phone", { email: "r@e.com" }),
      "9876543210"
    );
    expect(updatedState.variables.phone).toBe("9876543210");
    expect(updatedState.currentNode).toBe("done");
  });

  test("invalid phone → stays on ask_phone, shows retry", async () => {
    mockInvalid();
    const { reply, updatedState } = await processMessage(
      extendedFlow,
      makeState("ask_phone", { email: "r@e.com" }),
      "What?"
    );
    expect(updatedState.currentNode).toBe("ask_phone");
    expect(updatedState.variables.phone).toBeUndefined();
    expect(reply).toContain("phone number");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Required Test 6: Variable substitution in prompt node
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — prompt node: {{variable}} substitution", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Test 6 — confirmation replaces {{name}} and {{budget}} correctly", async () => {
    const { reply } = await processMessage(
      sampleFlow,
      makeState("confirmation", { name: "Rohan", budget: "30 lakhs" }),
      ""
    );

    expect(reply).toContain("Rohan");
    expect(reply).toContain("30 lakhs");
    expect(reply).not.toContain("{{name}}");
    expect(reply).not.toContain("{{budget}}");
  });

  test("prompt with missing variable leaves placeholder unchanged", async () => {
    const { reply } = await processMessage(
      sampleFlow,
      makeState("confirmation", { name: "Rohan" }), // budget missing
      ""
    );
    expect(reply).toContain("Rohan");
    expect(reply).toContain("{{budget}}"); // unresolved, kept as-is
  });

  test("email + phone substituted in extended flow confirmation", async () => {
    const { reply } = await processMessage(
      extendedFlow,
      makeState("done", { email: "rahul@test.com", phone: "9876543210" }),
      ""
    );
    expect(reply).toContain("rahul@test.com");
    expect(reply).toContain("9876543210");
    expect(reply).not.toContain("{{");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full happy-path end-to-end
// ─────────────────────────────────────────────────────────────────────────────
describe("processMessage — full happy path (assignment example)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("YES → budget → name → confirmation with variable substitution", async () => {
    // Turn 0: initial display
    const { updatedState: s0 } = await processMessage(
      sampleFlow,
      createInitialState("check_person"),
      ""
    );
    expect(s0.currentNode).toBe("check_person");
    expect(classifyIntent).not.toHaveBeenCalled();

    // Turn 1: user confirms → YES → ask_budget
    (classifyIntent as jest.Mock).mockResolvedValue("YES");
    const { updatedState: s1, reply: r1 } = await processMessage(
      sampleFlow,
      s0,
      "yes that's me"
    );
    expect(s1.currentNode).toBe("ask_budget");
    expect(r1).toContain("loan amount");

    // Turn 2: valid budget → stored → ask_name
    mockValid("30 lakhs");
    const { updatedState: s2, reply: r2 } = await processMessage(
      sampleFlow,
      s1,
      "around 30 lakhs"
    );
    expect(s2.variables.budget).toBe("30 lakhs");
    expect(s2.currentNode).toBe("ask_name");
    expect(r2).toContain("name to put on the file");

    // Turn 3: valid name → stored → confirmation
    mockValid("Rohan");
    const { updatedState: s3, reply: r3 } = await processMessage(
      sampleFlow,
      s2,
      "Rohan"
    );
    expect(s3.variables.name).toBe("Rohan");
    expect(s3.currentNode).toBe("confirmation");

    // Confirmation: both {{name}} and {{budget}} substituted
    expect(r3).toContain("Rohan");
    expect(r3).toContain("30 lakhs");
    expect(r3).not.toContain("{{");
  });

  test("NO path → goes directly to goodbye", async () => {
    (classifyIntent as jest.Mock).mockResolvedValue("NO");
    const { updatedState } = await processMessage(
      sampleFlow,
      makeState("check_person"),
      "no, wrong person"
    );
    expect(updatedState.currentNode).toBe("goodbye");
  });

  test("invalid budget, then valid → retries correctly", async () => {
    // Invalid attempt
    mockInvalid();
    const { updatedState: after1 } = await processMessage(
      sampleFlow,
      makeState("ask_budget"),
      "I don't know"
    );
    expect(after1.currentNode).toBe("ask_budget");
    expect(after1.variables.budget).toBeUndefined();

    // Valid attempt
    mockValid("30 lakhs");
    const { updatedState: after2 } = await processMessage(
      sampleFlow,
      after1,
      "30 lakhs"
    );
    expect(after2.variables.budget).toBe("30 lakhs");
    expect(after2.currentNode).toBe("ask_name");
  });

  test("invalid name, then valid → retries correctly", async () => {
    // Invalid attempt
    mockInvalid();
    const { updatedState: after1 } = await processMessage(
      sampleFlow,
      makeState("ask_name", { budget: "30 lakhs" }),
      "I didn't understand"
    );
    expect(after1.currentNode).toBe("ask_name");
    expect(after1.variables.name).toBeUndefined();

    // Valid attempt
    mockValid("Rohan");
    const { updatedState: after2 } = await processMessage(
      sampleFlow,
      after1,
      "My name is Rohan"
    );
    expect(after2.variables.name).toBe("Rohan");
    expect(after2.currentNode).toBe("confirmation");
  });
});
