# 🎓 Mini Conversational Flow Agent

A production-quality AI-powered college admission assistant built with **Next.js 15**, **Google Gemini**, and a **JSON-driven flow engine**. The conversation is entirely data-driven — no flow logic lives in TypeScript.

---

## ✨ Features

- 🤖 **Flow Engine** — walks a JSON graph of `prompt`, `collect`, and `condition` nodes
- 🧠 **Gemini Integration** — intent classification (`YES / NO / UNCLEAR`) and natural language generation
- 🔒 **Secure by design** — API key never leaves the server; no client-side Gemini calls
- 💬 **Variable substitution** — `{{name}}`, `{{email}}`, `{{course}}` filled from collected answers
- 🎨 **Premium UI** — glassmorphism dark theme, animated typing indicator, auto-scroll
- 🧪 **Automated tests** — Jest + Gemini fully mocked; zero real API calls during testing

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v3 |
| LLM | Google Gemini 2.5 Flash |
| Testing | Jest + Babel |
| Deployment | Vercel |

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- A Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))

### 2. Installation

```bash
# Clone or download the project
cd "INBOTIQ assignment"

# Install dependencies
npm install
```

### 3. Add your Gemini API Key

```bash
# Copy the example env file
cp .env.example .env.local

# Open .env.local and add your key
# GEMINI_API_KEY=your_actual_key_here
```

> ⚠️ **Never commit `.env.local`** — it is already in `.gitignore`

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

Tests are in `/tests/` and mock the Gemini API — **no real API calls are made during testing**.

---

## 🌐 Deploying to Vercel

### Option A: Vercel CLI

```bash
npm install -g vercel
vercel deploy
```

### Option B: Vercel Dashboard

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add `GEMINI_API_KEY` in **Project Settings → Environment Variables**
4. Click **Deploy**

> The project is zero-config for Vercel — Next.js is auto-detected.

---

## 🏗️ Project Architecture

```
INBOTIQ assignment/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts        # POST /api/chat — orchestrates the flow engine
│   ├── globals.css             # Tailwind base + custom animations
│   ├── layout.tsx              # Root layout with SEO metadata
│   └── page.tsx                # Home page (server component)
│
├── components/
│   ├── ChatInterface.tsx        # Top-level client component — manages state
│   ├── MessageBubble.tsx        # Renders individual chat messages
│   ├── TypingIndicator.tsx      # Animated three-dot loading indicator
│   └── ChatInput.tsx            # Textarea + send button
│
├── lib/
│   ├── types.ts                 # All shared TypeScript types
│   ├── state.ts                 # Pure, immutable state functions
│   ├── llm.ts                   # ONLY Gemini file: generatePrompt() + classifyIntent()
│   └── flowEngine.ts            # Flow walker: prompt / collect / condition nodes
│
├── flows/
│   └── admissionFlow.json       # 7-node College Admission flow (pure data)
│
├── tests/
│   ├── flowEngine.test.ts       # Flow engine + variable substitution tests
│   └── llm.test.ts              # LLM service normalisation tests
│
├── .env.example                 # Environment variable template
├── next.config.ts               # Next.js config
├── tailwind.config.ts           # Tailwind design tokens
├── jest.config.ts               # Jest configuration
├── README.md
└── WRITEUP.md
```

### Data Flow

```
Browser
 └─ ChatInterface (client)
      │  POST /api/chat  { message, conversationState }
      ▼
    app/api/chat/route.ts
      │  reads flows/admissionFlow.json
      │  calls lib/flowEngine.processMessage()
      │     └─ calls lib/llm.classifyIntent() for condition nodes
      │     └─ calls lib/llm.generatePrompt() (optional enrichment)
      ▼
    returns { reply, updatedState }
      └─ ChatInterface renders new messages
```

### State Model

The `ConversationState` is a plain JSON object that travels with every request — **no server-side sessions**:

```typescript
{
  currentNode: string;           // Which node we're at
  variables: Record<string, string>; // Collected answers (name, email, course)
  history: ChatMessage[];        // Full message history for the UI
}
```

### Flow Node Types

| Type | Purpose |
|---|---|
| `prompt` | Sends a bot message, auto-advances |
| `collect` | Asks a question, stores answer in `variables` |
| `condition` | Classifies user input with Gemini → branches to YES/NO/UNCLEAR node |

---

## 📝 Adding a New Flow

1. Create a new JSON file in `/flows/`
2. Follow the same schema as `admissionFlow.json`
3. Update `app/api/chat/route.ts` to load your new flow file

---

## 🔧 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Your Google Gemini API key |

---

## 📄 License

MIT — free to use and modify.
