import ChatInterface from "@/components/ChatInterface";

/**
 * Home page — renders the Chat Interface.
 * The page itself is a server component; ChatInterface is a client component.
 */
export default function Home() {
  return (
    <main className="relative min-h-dvh bg-[#0f1117] overflow-hidden">
      {/* Ambient background blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-64 -left-64 w-[600px] h-[600px] rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute -bottom-64 -right-64 w-[500px] h-[500px] rounded-full bg-purple-700/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-brand-500/5 blur-3xl" />
      </div>

      {/* Chat Interface */}
      <div className="relative z-10 flex flex-col min-h-dvh">
        <ChatInterface />
      </div>
    </main>
  );
}
