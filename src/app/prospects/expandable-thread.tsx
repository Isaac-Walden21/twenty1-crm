"use client";

import { useState } from "react";

type ThreadMessage = {
  id: number;
  direction: "sent" | "received";
  subject: string | null;
  body: string | null;
  date: string | null;
  sender: string | null;
  type: string | null;
  response_type?: string | null;
};

export function ExpandableThread({ prospectId, emailCount }: { prospectId: number; emailCount: number }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<ThreadMessage[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    if (!thread) {
      setLoading(true);
      const res = await fetch(`/api/prospects/${prospectId}/thread`);
      const data = await res.json();
      setThread(data);
      setLoading(false);
    }

    setOpen(true);
  }

  if (emailCount === 0) return null;

  return (
    <>
      <button
        onClick={toggle}
        className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {emailCount} email{emailCount !== 1 ? "s" : ""}
      </button>

      {open && (
        <div className="mt-2">
          {loading ? (
            <div className="text-xs text-zinc-600 py-4">Loading thread...</div>
          ) : thread && thread.length > 0 ? (
            <div className="space-y-2">
              {thread.map((msg) => (
                <div
                  key={`${msg.direction}-${msg.id}`}
                  className={`rounded-lg p-3 text-xs ${
                    msg.direction === "sent"
                      ? "bg-zinc-800/60 border border-zinc-700/50"
                      : "bg-indigo-950/30 border border-indigo-800/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`font-medium ${msg.direction === "sent" ? "text-zinc-300" : "text-indigo-300"}`}>
                      {msg.direction === "sent" ? (msg.sender || "You") : "Reply"}
                    </span>
                    {msg.direction === "sent" && msg.type && (
                      <span className="text-[10px] text-zinc-600">{msg.type === "followup" ? "Follow-up" : "Cold"}</span>
                    )}
                    {msg.direction === "received" && msg.response_type && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        msg.response_type === "interested" ? "bg-emerald-500/20 text-emerald-300" :
                        msg.response_type === "not_interested" ? "bg-red-500/20 text-red-300" :
                        "bg-blue-500/20 text-blue-300"
                      }`}>
                        {msg.response_type.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="text-zinc-600 ml-auto">{msg.date || ""}</span>
                  </div>
                  {msg.subject && (
                    <div className="text-zinc-400 font-medium mb-1">{msg.subject}</div>
                  )}
                  {msg.body ? (
                    msg.body.startsWith("<") ? (
                      <div
                        className="text-zinc-400 leading-relaxed prose-invert max-h-64 overflow-y-auto [&_*]:text-xs [&_*]:!text-zinc-400 [&_a]:!text-emerald-400"
                        dangerouslySetInnerHTML={{ __html: msg.body }}
                      />
                    ) : (
                      <div className="text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {msg.body}
                      </div>
                    )
                  ) : (
                    <div className="text-zinc-600 italic">(no body)</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-600 py-2">No messages found.</div>
          )}
        </div>
      )}
    </>
  );
}
