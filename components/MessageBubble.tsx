"use client";

/**
 * MessageBubble — renders a single chat message.
 *
 * Bot messages appear on the left with a branded avatar.
 * User messages appear on the right with a user avatar.
 * Supports basic markdown-like bold (**text**) rendering.
 */

import { ChatMessage } from "@/lib/types";
import { memo } from "react";

interface MessageBubbleProps {
  message: ChatMessage;
}

/** Very lightweight markdown renderer: **bold**, newlines → <br /> */
function renderContent(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    // Split on **bold** patterns
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, partIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={partIdx} className="font-semibold text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={partIdx}>{part}</span>;
    });
    return (
      <span key={lineIdx}>
        {rendered}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    );
  });
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isBot = message.role === "bot";

  return (
    <div
      className={`flex items-end gap-3 w-full ${
        isBot ? "justify-start animate-slide-in-left" : "justify-end animate-slide-in-right"
      }`}
    >
      {/* Bot Avatar */}
      {isBot && (
        <div
          aria-hidden="true"
          className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-white"
          >
            <path d="M16.5 7.5h-9v9h9v-9z" />
            <path
              fillRule="evenodd"
              d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15H21a.75.75 0 010 1.5h-.75v.75a3 3 0 01-3 3h-.75V21a.75.75 0 01-1.5 0v-.75h-2.25V21a.75.75 0 01-1.5 0v-.75H9V21a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3A.75.75 0 013 15h.75v-2.25H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75v-.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`
          relative rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-md
          ${
            isBot
              ? "max-w-[70%] bg-[#1c2028] border border-[#2a2f3a] text-slate-200 rounded-bl-sm"
              : "max-w-[60%] bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-br-sm shadow-brand-500/20"
          }
        `}
      >
        <p className="msg-content whitespace-pre-wrap break-words">
          {renderContent(message.content)}
        </p>
        <time
          className={`block mt-1.5 text-[10px] ${
            isBot ? "text-slate-500" : "text-brand-200"
          }`}
          dateTime={new Date(message.timestamp).toISOString()}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>

      {/* User Avatar */}
      {!isBot && (
        <div
          aria-hidden="true"
          className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg border border-slate-600/50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-slate-300"
          >
            <path
              fillRule="evenodd"
              d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
