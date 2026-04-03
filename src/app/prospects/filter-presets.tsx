"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type SavedFilter = {
  id: number;
  name: string;
  filters: Record<string, string>;
};

export function FilterPresets({ presets }: { presets: SavedFilter[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const currentFilters: Record<string, string> = {};
  searchParams.forEach((value, key) => { currentFilters[key] = value; });
  const hasFilters = Object.keys(currentFilters).length > 0;

  async function savePreset() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), filters: currentFilters }),
    });
    setSaving(false);
    setShowSave(false);
    setName("");
    router.refresh();
  }

  async function deletePreset(id: number) {
    await fetch("/api/filters", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  function applyPreset(filters: Record<string, string>) {
    const params = new URLSearchParams(filters);
    router.push(`/prospects?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((preset) => (
        <div key={preset.id} className="flex items-center gap-0.5 group">
          <button
            onClick={() => applyPreset(preset.filters)}
            className="px-2.5 py-1.5 rounded-l-full text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            {preset.name}
          </button>
          <button
            onClick={() => deletePreset(preset.id)}
            className="px-1.5 py-1.5 rounded-r-full text-xs bg-zinc-800 text-zinc-600 hover:text-red-400 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
          >
            x
          </button>
        </div>
      ))}

      {hasFilters && !showSave && (
        <button
          onClick={() => setShowSave(true)}
          className="px-2.5 py-1.5 rounded-full text-xs border border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
        >
          + Save filter
        </button>
      )}

      {showSave && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Filter name..."
            autoFocus
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs w-32 focus:outline-none focus:border-emerald-500"
            onKeyDown={(e) => e.key === "Enter" && savePreset()}
          />
          <button
            onClick={savePreset}
            disabled={saving || !name.trim()}
            className="px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "..." : "Save"}
          </button>
          <button
            onClick={() => setShowSave(false)}
            className="px-1.5 py-1.5 text-xs text-zinc-500 hover:text-white"
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}
