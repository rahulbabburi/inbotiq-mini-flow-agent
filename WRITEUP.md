# WRITEUP — Mini Conversational Flow Agent

## What Works

The project is a fully functional conversational AI agent for college admissions:

- **End-to-end conversation flow**: The app walks through a 7-node JSON flow from a welcome message through name/email/course collection to a personalised confirmation or polite goodbye.
- **Variable substitution**: Collected user inputs are embedded in subsequent messages using `{{name}}`, `{{email}}`, `{{course}}` placeholders that are replaced at runtime.
- **Gemini intent classification**: Condition nodes send the user's response to Gemini 2.5 Flash with a zero-shot classification prompt. The model returns YES, NO, or UNCLEAR, and the engine branches accordingly.
- **Stateless API**: Every request carries the full `ConversationState` — no sessions, no database, no Redis. The client is the source of truth.
- **Automated tests**: 12 tests covering variable substitution, node map building, condition branching (YES/NO/UNCLEAR), collect node behaviour, prompt node auto-advance, and LLM normalisation. All tests run without real Gemini API calls.
- **Premium UI**: Dark glassmorphism theme, animated typing indicator, optimistic message rendering, auto-scroll, and responsive layout.
- **Vercel-ready**: Zero config beyond adding the `GEMINI_API_KEY` environment variable.

---

## Architecture

### Clean Separation of Concerns

The codebase is organised around four responsibilities:

| Module | Responsibility |
|---|---|
| `lib/types.ts` | All TypeScript types — single source of truth |
| `lib/state.ts` | Pure state manipulation — no side effects |
| `lib/llm.ts` | All Gemini calls — `generatePrompt` and `classifyIntent` only |
| `lib/flowEngine.ts` | Flow traversal — reads nodes, substitutes variables, calls `llm.ts` |
| `app/api/chat/route.ts` | HTTP handler — wires everything together |
| `components/` | UI — pure presentation, no business logic |

### Why Stateless Design?

Instead of storing session state on the server, the full `ConversationState` is returned to the client on every API response and sent back on every request. This has several advantages:

- **No infrastructure cost**: No Redis, no database, no session middleware
- **Trivially scalable**: Any server instance can handle any request
- **Vercel-compatible**: Works perfectly with serverless functions
- **Debuggable**: The state is inspectable in browser DevTools

### Why a JSON Flow?

By storing the flow in `admissionFlow.json` instead of TypeScript, the conversation logic becomes:

- **Editable without redeployment** (on platforms with external config)
- **Readable by non-engineers**
- **Testable in isolation** — you can test the engine against any JSON fixture
- **Extensible** — add new node types (e.g., `api_call`, `branch_on_variable`) without touching the JSON schema

---

## Assumptions

1. **Gemini 2.5 Flash is the model** — chosen for its speed and cost-efficiency in a conversational setting. To switch models, change the `GEMINI_MODEL` constant in `lib/llm.ts` — no other file needs updating.

2. **Intent classification returns a single word** — the prompt to Gemini is engineered to constrain output to `YES`, `NO`, or `UNCLEAR`. Any unexpected output defaults to `UNCLEAR` (fail-safe).

3. **No authentication** — the assignment spec doesn't require user accounts. A production version would add NextAuth or Clerk.

4. **No persistence** — conversation history lives in React state and the `ConversationState` JSON. Refreshing the page starts a new conversation. A production version would use a database.

5. **One active flow** — the app loads `admissionFlow.json` at runtime. The architecture supports multiple flows with minor changes to the API route.

6. **Optimistic UI** — user messages are rendered immediately before the API responds, improving perceived performance.

---

## Challenges

### 1. Stateless State Management

The trickiest design decision was making `ConversationState` fully serialisable without losing correctness. The key insight was that `history` only needs to be appended to — never mutated — so the immutable update pattern in `lib/state.ts` (returning new objects) works perfectly.

### 2. Node Chaining

When a `prompt` node has a `next` pointing to another `prompt`, or when a `collect` answer needs to immediately show the next question, the engine needs to chain node processing within a single API call. This was handled by having each node processor look ahead at the next node and render its content as part of the same reply.

### 3. Gemini Prompt Engineering

Getting Gemini to reliably return exactly `YES`, `NO`, or `UNCLEAR` required careful prompt engineering. The final prompt:
- States the exact constraint ("ONLY the label")
- Gives explicit definitions for each label
- Lists rules (e.g., "polite declines count as NO")
- The normalisation in `classifyIntent()` handles lowercase, extra whitespace, and unexpected output as a safety net

### 4. Jest + Next.js Module Resolution

Testing TypeScript modules that use Next.js path aliases (`@/lib/...`) required configuring `moduleNameMapper` in `jest.config.ts`. Using `babel-jest` with `@babel/preset-typescript` avoids the complexity of `ts-jest` while still providing full TypeScript support in tests.

---

## Future Improvements

### Short-term
- **Streaming responses**: Use Gemini's streaming API with Next.js `StreamingTextResponse` to show tokens as they arrive, reducing perceived latency
- **Conversation persistence**: Store conversations in a database (e.g., Supabase, PlanetScale) so users can resume sessions
- **Rich message types**: Support image cards, option buttons, and quick replies in addition to plain text

### Medium-term
- **Flow editor UI**: A drag-and-drop visual editor for building JSON flows without writing JSON manually
- **Multi-flow support**: Route different user intents to different flows (e.g., admissions, financial aid, campus tours)
- **Analytics dashboard**: Track conversation completion rates, drop-off nodes, and common UNCLEAR responses

### Long-term
- **LLM-generated collect validation**: Use Gemini to validate that collected values are plausible (e.g., "is this a valid email format?") before storing them
- **Human handoff**: Detect when the user is frustrated and escalate to a live agent via a WebSocket integration
- **Multilingual support**: Use Gemini's multilingual capabilities to automatically respond in the user's language
- **A/B testing flows**: Support multiple flow variants and track conversion rates per variant
