"use client";

/**
 * ChatInterface — the top-level client component.
 *
 * Layout: full-viewport column (ChatGPT / Claude style)
 *   ┌─────────────────────────────────────────────┐  ← header  (flex-shrink-0)
 *   │                                             │
 *   │            scrollable messages              │  ← flex: 1, overflow-y: auto
 *   │                                             │
 *   ├─────────────────────────────────────────────┤
 *   │               input bar                     │  ← flex-shrink-0 (always visible)
 *   └─────────────────────────────────────────────┘
 *
 * Responsibilities:
 *  - Manages local UI state (input, loading, error)
 *  - Owns the ConversationState received from the API
 *  - Calls POST /api/chat on each send
 *  - Auto-scrolls to the latest message
 *  - Initialises the conversation on mount (first empty message)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import type { ConversationState, ChatMessage, ChatResponse } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiError {
  error: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversationState, setConversationState] =
    useState<ConversationState | null>(null);
  const [displayedMessages, setDisplayedMessages] = useState<ChatMessage[]>([]);
  const [isConversationEnded, setIsConversationEnded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialised = useRef(false);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [displayedMessages, isLoading, scrollToBottom]);

  // ── API Call ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (message: string, currentState: ConversationState | null) => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const body = {
          message,
          conversationState: currentState,
        };

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody: ApiError = await res.json();
          throw new Error(errBody.error || `Server error: ${res.status}`);
        }

        const data: ChatResponse = await res.json();

        setConversationState(data.updatedState);
        setDisplayedMessages(data.updatedState.history);

        // Detect terminal nodes
        const lastMsg = data.updatedState.history[data.updatedState.history.length - 1];
        if (
          lastMsg?.role === "bot" &&
          (data.updatedState.currentNode === "confirmation" ||
            data.updatedState.currentNode === "goodbye")
        ) {
          setIsConversationEnded(true);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to reach the server. Please try again.";
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ── Initialise conversation ───────────────────────────────────────────────
  useEffect(() => {
    if (hasInitialised.current) return;
    hasInitialised.current = true;
    sendMessage("", null);
  }, [sendMessage]);

  // ── Handle user send ──────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const optimisticUserMsg: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setDisplayedMessages((prev) => [...prev, optimisticUserMsg]);
    setInputValue("");

    sendMessage(trimmed, conversationState);
  }, [inputValue, isLoading, conversationState, sendMessage]);

  // ── Restart conversation ──────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    setConversationState(null);
    setDisplayedMessages([]);
    setIsConversationEnded(false);
    setErrorMessage(null);
    setInputValue("");
    hasInitialised.current = false;
    setTimeout(() => {
      hasInitialised.current = true;
      sendMessage("", null);
    }, 50);
  }, [sendMessage]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    /*
     * Root shell — fills the entire viewport, no horizontal scrollbar.
     * max-w + mx-auto centres the content on ultra-wide displays.
     */
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
      className="w-full lg:w-[95%] max-w-[1600px] mx-auto"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between flex-shrink-0 px-5 py-3 border-b border-[#2a2f3a] bg-[#16191f]/90 backdrop-blur-md"
        style={{ zIndex: 10 }}
      >
        {/* Brand / status */}
        <div className="flex items-center gap-3">
          {/* Logo orb */}
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30 flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 text-white"
              aria-hidden="true"
            >
              <path d="M16.5 7.5h-9v9h9v-9z" />
              <path
                fillRule="evenodd"
                d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15H21a.75.75 0 010 1.5h-.75v.75a3 3 0 01-3 3h-.75V21a.75.75 0 01-1.5 0v-.75h-2.25V21a.75.75 0 01-1.5 0v-.75H9V21a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3A.75.75 0 013 15h.75v-2.25H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75v-.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z"
                clipRule="evenodd"
              />
            </svg>
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#16191f]" />
          </div>

          <div>
            <h1 className="text-sm font-semibold text-slate-100 leading-tight">
              Home Loan Enquiry Assistant
            </h1>
            <p className="text-[11px] text-emerald-400 font-medium">
              {isLoading ? "Typing…" : "Online"}
            </p>
          </div>
        </div>

        {/* Right side: model badge + restart */}
        <div className="flex items-center gap-3">


          <button
            id="restart-button"
            onClick={handleRestart}
            aria-label="Restart conversation"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-[#1c2028] border border-transparent hover:border-[#2a2f3a] transition-all duration-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                clipRule="evenodd"
              />
            </svg>
            Restart
          </button>
        </div>
      </header>

      {/* ── Message area — flex:1 so it fills remaining height ────────────── */}
      <section
        className="flex-1 overflow-y-auto"
        aria-label="Chat history"
        aria-live="polite"
        aria-atomic="false"
        style={{ minHeight: 0 }} /* prevents flex child overflow */
      >
        {/* Inner content full width with small horizontal padding */}
        <div className="w-full px-4 sm:px-6 py-6 space-y-5">
          {/* Empty / loading state */}
          {displayedMessages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-600/20 border border-brand-500/20 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-8 h-8 text-brand-400"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">Starting conversation…</p>
            </div>
          )}

          {/* Messages */}
          {displayedMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Typing indicator */}
          {isLoading && <TypingIndicator />}

          {/* Error banner */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Conversation ended banner */}
          {isConversationEnded && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-px w-full bg-[#2a2f3a]" />
              <p className="text-xs text-slate-500">Conversation ended</p>
              <button
                id="start-new-button"
                onClick={handleRestart}
                className="px-4 py-2 rounded-lg text-sm bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 hover:border-brand-500/40 transition-all duration-200"
              >
                Start a new conversation
              </button>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </section>

      {/* ── Input bar — always visible at the bottom ───────────────────────── */}
      <div
        className="flex-shrink-0 w-full"
        style={{ zIndex: 10 }}
      >
        {/* Full width with small horizontal padding */}
        <div className="w-full px-4 sm:px-6 pb-4">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}
            isDisabled={isConversationEnded}
            placeholder={
              isConversationEnded
                ? "Conversation has ended — click Restart to begin again"
                : "Type your message… (Enter to send)"
            }
          />
        </div>
      </div>
    </div>
  );
}
