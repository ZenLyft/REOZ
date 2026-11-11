'use client';

import { useState } from 'react';

export function AIChatDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: 'Welcome Niresh! I am your REOZ Chief AI Orchestrator (Global Mode).\n\nYou can tell me commands like:\n• *"Find 20 colleges or hotels in London, Dubai, or Singapore"*\n• *"Discover hostels worldwide for ZenLyft HOMS"*\n• *"Show my top qualified leads"*\n• *"What is my revenue pipeline?"*',
    },
  ]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.response || `Error: ${data.error || 'Failed to execute command'}`,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Network error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-2xl shadow-indigo-600/40 hover:bg-indigo-500 transition-all active:scale-95"
      >
        <span className="text-lg">⚡</span>
        <span>AI Command Centre</span>
      </button>

      {/* Slide-out Drawer */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[450px] border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl flex flex-col justify-between backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className="font-bold text-zinc-100">REOZ Orchestrator</h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Powered by Groq Llama 3.3 70B & Overpass Tools</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto space-y-3 py-4 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${
                  m.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="animate-spin text-sm">⏳</span> Orchestrating agent tools & queries...
              </div>
            )}
          </div>

          {/* Command Input Form */}
          <form onSubmit={handleSend} className="border-t border-zinc-800 pt-3">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Give command (e.g. Find clinics in Tiruppur)..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none pr-12"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="absolute right-2 top-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Run
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

