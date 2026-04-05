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

export function ThreadToggle({
  prospectId,
  emailCount,
  isOpen,
  onToggle,
}: {
  prospectId: number;
  emailCount: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (emailCount === 0) return null;

  return (
    <button
      onClick={onToggle}
      className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
      {emailCount} email{emailCount !== 1 ? "s" : ""}
    </button>
  );
}

export function ThreadPanel({
  prospectId,
  businessName,
}: {
  prospectId: number;
  businessName: string;
}) {
  const [thread, setThread] = useState<ThreadMessage[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!thread && !loading) {
    setLoading(true);
    fetch(`/api/prospects/${prospectId}/thread`)
      .then((r) => r.json())
      .then((data) => { setThread(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  if (loading) {
    return (
      <div className="px-6 py-6 text-xs text-zinc-600">Loading thread...</div>
    );
  }

  if (!thread || thread.length === 0) {
    return (
      <div className="px-6 py-4 text-xs text-zinc-600">No messages found.</div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4 max-w-2xl mx-auto">
      <div className="space-y-3">
        {thread.map((msg) => {
          const isSent = msg.direction === "sent";
          const time = msg.date
            ? new Date(msg.date + (msg.date.includes("T") ? "" : "T12:00:00")).toLocaleDateString("en-US", {
                month: "short", day: "numeric",
              })
            : "";

          return (
            <div key={`${msg.direction}-${msg.id}`}>
              {/* Sender label */}
              <div className={`flex items-center gap-2 mb-1 ${isSent ? "justify-end" : "justify-start"}`}>
                {!isSent && msg.response_type && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    msg.response_type === "interested" ? "bg-emerald-500/20 text-emerald-300" :
                    msg.response_type === "not_interested" ? "bg-red-500/20 text-red-300" :
                    "bg-blue-500/20 text-blue-300"
                  }`}>
                    {msg.response_type.replace(/_/g, " ")}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">
                  {isSent ? (
                    <>
                      <span className="capitalize">{msg.sender || "You"}</span>
                      {msg.type && (
                        <span className="text-zinc-700 ml-1">
                          {msg.type === "followup" ? "follow-up" : "cold"}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>{businessName}</span>
                  )}
                  {time && <span className="ml-1.5 text-zinc-700">{time}</span>}
                </span>
              </div>

              {/* Bubble */}
              <div className={`flex ${isSent ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isSent
                      ? "bg-emerald-600 text-white rounded-br-md"
                      : "bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-bl-md"
                  }`}
                >
                  {msg.subject && (
                    <div className={`text-xs font-semibold mb-1 ${isSent ? "text-emerald-100" : "text-zinc-400"}`}>
                      {msg.subject}
                    </div>
                  )}
                  {msg.body ? (
                    msg.body.startsWith("<") ? (
                      <div
                        className={`leading-relaxed max-h-72 overflow-y-auto text-sm ${
                          isSent
                            ? "[&_*]:!text-white/90 [&_a]:!text-emerald-100 [&_a]:underline"
                            : "[&_*]:!text-zinc-300 [&_a]:!text-emerald-400"
                        }`}
                        dangerouslySetInnerHTML={{ __html: msg.body }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                        {msg.body}
                      </div>
                    )
                  ) : (
                    <div className={`italic text-xs ${isSent ? "text-emerald-200" : "text-zinc-600"}`}>
                      (no body)
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Standalone version for mobile cards
export function ExpandableThread({ prospectId, emailCount, businessName }: { prospectId: number; emailCount: number; businessName: string }) {
  const [open, setOpen] = useState(false);

  if (emailCount === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
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
        <div className="mt-2 -mx-4 bg-zinc-950 border-t border-zinc-800">
          <ThreadPanel prospectId={prospectId} businessName={businessName} />
        </div>
      )}
    </>
  );
}
