# Diagnosis and Fix Walkthrough: JSON Flow Engine & API Key Setup

We resolved the critical workflow bug in the JSON Flow Engine and the missing OpenRouter API key environment variable mapping.

---

## 1. Root Cause Analysis

### API Key Mapping Issue (Main Cause of Restart Loop)
* **What Happened**: The previous assistant refactored the LLM client in `lib/llm.ts` to call OpenRouter instead of Google Gemini. In doing so, they updated the environment variable lookup to expect `OPENROUTER_API_KEY`.
* **The Conflict**: The user's system and Vercel environments were configured with `GEMINI_API_KEY` (containing the OpenRouter API key value). Because `OPENROUTER_API_KEY` was missing in those environments:
  1. The LLM validator threw a connection/key lookup error.
  2. The condition node (`check_person`) catch block handled the error by defaulting the user's intent to `UNCLEAR`.
  3. Because it was `UNCLEAR`, the engine stayed on the initial node and repeated the question: `"Hi! Are you the right person to talk to about your home loan enquiry?"`.
  4. This retry behavior presented to the user as if the conversation reset and cleared variables.

### Collect Node Intent Leak Prevention
* **What Happened**: We verified that collect nodes do not call `classifyIntent` (which is reserved exclusively for condition nodes), avoiding conflicts with yes/no intents on text inputs.
* **Fix Applied**: Ensured that the collect node only invokes `validateCollect` (local regex extraction + LLM fallback validator) to extract semantic fields like `loan_amount` or `name` rather than YES/NO classifications.

---

## 2. Actions Taken & Fixes Applied

1. **Mapped Environment Keys**:
   * Added mapping in [lib/llm.ts](file:///c:/Users/Babburi%20Rahul%20Goud/Desktop/INBOTIQ%20assignment/lib/llm.ts) to automatically fall back to `GEMINI_API_KEY` if `OPENROUTER_API_KEY` is not present in the environment:
     ```typescript
     if (process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
       process.env.OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;
     }
     ```
2. **Added State Transition Console Logs**:
   * Added transition logs to Prompt, Collect, and Condition node handlers in [lib/flowEngine.ts](file:///c:/Users/Babburi%20Rahul%20Goud/Desktop/INBOTIQ%20assignment/lib/flowEngine.ts) to output:
     - `Current node`
     - `Node type`
     - `Extracted value`
     - `Variables before`
     - `Variables after`
     - `Next node`
3. **Automated verification tests**:
   * Created a dedicated validation suite [tests/workflowBug.test.ts](file:///c:/Users/Babburi%20Rahul%20Goud/Desktop/INBOTIQ%20assignment/tests/workflowBug.test.ts) covering the exact requested test items:
     - Happy path
     - Invalid budget retry
     - Invalid name retry
     - Retry without restarting
     - Variable substitution
     - State persistence
     - Branching
     - Conversation completion
4. **Vercel Cloud Update**:
   * Deployed the update to production via `vercel --prod` (`npx vercel --prod --yes`).
5. **Updated flowEngine.test.ts**:
   * Replaced legacy references to `variables.budget` and `{{budget}}` with `variables.loanAmount` and `{{loanAmount}}` to align the mock assertions with the flow schema, bringing the final test pass rate to 100%.

---

## 3. Verification Results

### Automated Tests
Ran `npm test` successfully with **159** passing tests:
* `tests/workflowBug.test.ts` (Passed)
* `tests/collectValidator.test.ts` (Passed)
* `tests/flowEngine.test.ts` (Passed)
* `tests/llm.test.ts` (Passed)
* `tests/validator.test.ts` (Passed)

### Local & Vercel Build Success
`npm run build` completed with zero compiler errors or warnings under Next.js 16 (Turbopack) in `4.5s`.
Production deployment updated successfully at: **[https://mini-flow-agent.vercel.app](https://mini-flow-agent.vercel.app)**
