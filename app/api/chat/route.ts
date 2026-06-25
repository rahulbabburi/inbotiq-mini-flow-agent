/**
 * POST /api/chat
 *
 * Receives a user message and the current conversation state.
 * Loads the flow JSON, runs it through the flow engine, and returns
 * the bot's reply along with the updated state.
 *
 * The Gemini API key lives exclusively on this server — it is NEVER
 * sent to the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { processMessage } from "@/lib/flowEngine";
import { createInitialState } from "@/lib/state";
import type { ChatRequest, ChatResponse, Flow, ConversationState } from "@/lib/types";

// ─── Flow Loader (cached after first read) ────────────────────────────────────

async function loadFlow(): Promise<Flow> {
  const flowPath = path.join(process.cwd(), "flows", "homeLoanFlow.json");
  const raw = await fs.readFile(flowPath, "utf-8");
  return JSON.parse(raw) as Flow;
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: ChatRequest = await request.json();
    const { message, conversationState } = body;

    // Basic validation
    if (typeof message !== "string") {
      return NextResponse.json(
        { error: "Invalid request: `message` must be a string." },
        { status: 400 }
      );
    }

    const flow = await loadFlow();

    // If no state provided (fresh conversation), create initial state
    const state: ConversationState =
      conversationState &&
      typeof conversationState.currentNode === "string"
        ? conversationState
        : createInitialState(flow.startNode);

    // Run the flow engine
    const { reply, updatedState } = await processMessage(flow, state, message);

    const responseBody: ChatResponse = { reply, updatedState };
    return NextResponse.json(responseBody, { status: 200 });
  } catch (error: unknown) {
    console.error("[/api/chat] Error:", error);

    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";

    // Don't expose internal details in production
    const isDevMode = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        error: isDevMode
          ? message
          : "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}
