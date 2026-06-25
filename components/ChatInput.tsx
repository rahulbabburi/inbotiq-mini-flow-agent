"use client";

/**
 * ChatInput — controlled text input with send button.
 * Supports keyboard shortcut: Enter to send, Shift+Enter for newline.
 */

import { useRef, KeyboardEvent, ChangeEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  isDisabled: boolean;
  placeholder?: string;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  isDisabled,
  placeholder = "Type your message…",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isDisabled && !isLoading && value.trim()) {
        onSend();
      }
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  const handleSendClick = () => {
    if (!isDisabled && !isLoading && value.trim()) {
      onSend();
      // Reset textarea height after send
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  return (
    <div className="relative flex items-end gap-3 p-4 border-t border-[#2a2f3a] bg-[#16191f]/80 backdrop-blur-sm">
      {/* Input field */}
      <div className="flex-1 relative">
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled || isLoading}
          rows={1}
          className={`
            w-full resize-none rounded-xl px-4 py-3 pr-12
            bg-[#1c2028] border border-[#2a2f3a]
            text-slate-200 placeholder-slate-500
            text-sm leading-relaxed
            transition-all duration-200
            focus:outline-none focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20
            disabled:opacity-50 disabled:cursor-not-allowed
            min-h-[48px] max-h-[120px] overflow-y-auto
          `}
          aria-label="Message input"
        />

        {/* Character hint */}
        <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-600 pointer-events-none select-none">
          ↵ Send
        </span>
      </div>

      {/* Send button */}
      <button
        id="send-button"
        onClick={handleSendClick}
        disabled={isDisabled || isLoading || !value.trim()}
        aria-label="Send message"
        className={`
          flex-shrink-0 w-11 h-11 rounded-xl
          bg-gradient-to-br from-brand-500 to-brand-600
          flex items-center justify-center
          transition-all duration-200
          hover:from-brand-400 hover:to-brand-500 btn-glow
          disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16191f]
          shadow-lg shadow-brand-500/25
          active:scale-95
        `}
      >
        {isLoading ? (
          /* Spinner */
          <svg
            className="w-4 h-4 text-white animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          /* Paper-plane icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-white"
            aria-hidden="true"
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        )}
      </button>
    </div>
  );
}
