"use client";

/**
 * TypingIndicator — animated three-dot indicator shown while the bot
 * is generating a response.
 */

export default function TypingIndicator() {
  return (
    <div
      className="flex items-end gap-3 w-full justify-start animate-slide-in-left"
      role="status"
      aria-label="Assistant is typing"
    >
      {/* Bot Avatar */}
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

      {/* Dots bubble */}
      <div className="bg-[#1c2028] border border-[#2a2f3a] rounded-2xl rounded-bl-sm px-4 py-3 shadow-md">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="typing-dot w-2 h-2 rounded-full bg-brand-400 block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-brand-400 block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-brand-400 block" />
        </div>
      </div>
    </div>
  );
}
