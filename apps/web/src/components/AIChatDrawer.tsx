'use client';

import { useState } from 'react';

export function AIChatDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: 'Welcome Niresh. I am your REOZ AI Orchestrator.\n\nTry commands like:\n• "Find colleges in London"\n• "Discover hostels in Singapore"\n• "What is my live revenue pipeline?"\n• "Draft a HOMS pitch for our top lead"',
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      setMessages((prev) => [...prev, { role: 'assistant', text: `Network error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating Rich Black Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 lg:bottom-6 right-5 z-50 flex items-center gap-2 rounded-full bg-[#11100E] px-5 py-3 text-xs sm:text-sm font-bold text-[#FAF6EE] shadow-xl hover:bg-[#272420] border border-[#2C2924] transition-all active:scale-95"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>AI Command Centre</span>
      </button>

      {/* Slide-out Cream & Rich Black Drawer */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] border-l border-[#DDD4C4] bg-[#FFFDF9] p-6 shadow-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#E5DDD0] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                <h3 className="font-bold text-[#11100E]">REOZ AI Orchestrator</h3>
              </div>
              <p className="text-xs text-[#5A554C] mt-0.5">
                Live CRM Context • Global Discovery & Strategy
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-2 py-1 text-sm text-[#5A554C] hover:bg-[#F2EBE0] hover:text-[#11100E]"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 py-4 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#11100E] text-[#FAF6EE]'
                      : 'bg-[#F4EEE3] border border-[#E5DDD0] text-[#11100E]'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-[#5A554C]">
                <span className="h-2 w-2 rounded-full bg-[#11100E] animate-ping" /> Running live
                query...
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="border-t border-[#E5DDD0] pt-3">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask or command (e.g. Find colleges in London)..."
                className="w-full rounded-xl border border-[#DDD4C4] bg-[#FAF6EE] px-4 py-3 text-xs text-[#11100E] placeholder-[#7C756A] focus:border-[#11100E] focus:outline-none pr-16"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="absolute right-2 top-1.5 rounded-lg bg-[#11100E] px-3.5 py-1.5 text-xs font-bold text-[#FAF6EE] hover:bg-[#272420] disabled:opacity-40"
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
