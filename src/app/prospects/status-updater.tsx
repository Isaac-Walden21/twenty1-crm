"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = [
  { value: "prospected", label: "Prospected", color: "bg-zinc-500/20 text-zinc-300" },
  { value: "followed_up", label: "Followed Up", color: "bg-blue-500/20 text-blue-300" },
  { value: "active_lead", label: "Active Lead", color: "bg-emerald-500/20 text-emerald-300" },
  { value: "negotiating", label: "Negotiating", color: "bg-amber-500/20 text-amber-300" },
  { value: "closed_won", label: "Closed Won", color: "bg-green-500/20 text-green-300" },
  { value: "closed_lost", label: "Closed Lost", color: "bg-red-500/20 text-red-300" },
  { value: "do_not_contact", label: "DNC", color: "bg-red-700/20 text-red-400" },
];

export function StatusUpdater({
  id,
  currentStatus,
  currentNotes,
}: {
  id: number;
  currentStatus: string;
  currentNotes: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(currentNotes);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [salePrice, setSalePrice] = useState("");

  const current = STATUSES.find((s) => s.value === currentStatus) || STATUSES[0];

  async function updateStatus(newStatus: string) {
    if (newStatus === "closed_won" && pendingStatus !== "closed_won") {
      setPendingStatus("closed_won");
      return;
    }

    setSaving(true);
    await fetch("/api/prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        status: newStatus,
        notes: notes || undefined,
        sale_price: newStatus === "closed_won" && salePrice ? parseFloat(salePrice) : undefined,
      }),
    });
    setSaving(false);
    setOpen(false);
    setPendingStatus(null);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`px-2.5 py-1 rounded text-xs cursor-pointer hover:ring-1 hover:ring-zinc-600 transition-all ${current.color}`}
      >
        {current.label}
      </button>
    );
  }

  // Overlay backdrop + centered modal on mobile, absolute dropdown on desktop
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={() => { setOpen(false); setPendingStatus(null); }} />

      <div className="fixed inset-x-3 bottom-3 z-50 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-1 bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-xl sm:min-w-[240px]">
        {pendingStatus === "closed_won" ? (
          <>
            <div className="text-sm text-green-400 font-semibold uppercase tracking-wider mb-3">Close as Won</div>
            <div className="mb-3">
              <label className="text-xs text-zinc-500 block mb-1">Sale Price</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-zinc-500">$</span>
                <input
                  type="number"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="2,500"
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 pl-7 text-sm text-white focus:outline-none focus:border-green-500"
                />
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Deal notes (optional)..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-300 resize-none h-16 focus:outline-none focus:border-zinc-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => updateStatus("closed_won")}
                disabled={saving || !salePrice}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-3 py-2.5 rounded-lg text-sm font-medium"
              >
                {saving ? "Saving..." : `Close — $${salePrice || "0"}`}
              </button>
              <button
                onClick={() => setPendingStatus(null)}
                className="px-3 py-2.5 text-sm text-zinc-500 hover:text-white"
              >
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-zinc-500 mb-2">Update status</div>
            <div className="space-y-0.5 mb-3">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  disabled={saving}
                  onClick={() => updateStatus(s.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    s.value === currentStatus
                      ? s.color + " font-medium"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-300 resize-none h-20 focus:outline-none focus:border-zinc-500 mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={() => updateStatus(currentStatus)}
                disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2.5 rounded-lg text-sm disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Notes"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2.5 text-sm text-zinc-500 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
