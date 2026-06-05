"use client";

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Prospect = {
  id: number;
  business_name: string;
  city: string | null;
  vertical: string | null;
  instagram_handle: string | null;
  dm_angle: string | null;
  reviews: number | null;
  rating: number | null;
  status: string;
};

const COLUMNS = [
  { id: "cold", label: "Cold", color: "border-zinc-700" },
  { id: "dm_sent", label: "DM Sent", color: "border-blue-700" },
  { id: "replied", label: "Replied", color: "border-cyan-700" },
  { id: "audit_booked", label: "Audit Booked", color: "border-emerald-700" },
  { id: "audit_done", label: "Audit Done", color: "border-amber-700" },
  { id: "closed_won", label: "Closed Won", color: "border-green-700" },
  { id: "closed_lost", label: "Closed Lost", color: "border-red-800" },
];

export function KanbanBoard({ prospects }: { prospects: Prospect[] }) {
  const router = useRouter();
  const [items, setItems] = useState(prospects);
  const [saving, setSaving] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: items.filter((p) => p.status === col.id),
  }));

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const id = parseInt(draggableId);
    const newStatus = destination.droppableId;

    // Optimistic update
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    setSaving(id);

    await fetch("/api/prospects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });

    setSaving(null);
    router.refresh();
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-10rem)]">
        {columns.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-64 sm:w-72">
            <div className={`border-t-2 ${col.color} bg-zinc-900 rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-300">{col.label}</h3>
                <span className="text-[10px] text-zinc-500">{col.items.length}</span>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-2 min-h-[100px] rounded-lg p-1 transition-colors ${
                      snapshot.isDraggingOver ? "bg-zinc-800/50" : ""
                    }`}
                  >
                    {col.items.map((prospect, index) => (
                      <Draggable key={prospect.id} draggableId={String(prospect.id)} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-zinc-800 border border-zinc-700 rounded-lg p-3 transition-shadow ${
                              snapshot.isDragging ? "shadow-xl shadow-black/50 ring-1 ring-emerald-500/50" : ""
                            } ${saving === prospect.id ? "opacity-50" : ""}`}
                          >
                            <p className="text-sm font-medium text-white leading-snug">
                              {prospect.business_name}
                            </p>
                            {prospect.instagram_handle && (
                              <a
                                href={`https://instagram.com/${prospect.instagram_handle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                              >
                                @{prospect.instagram_handle}
                              </a>
                            )}
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-[10px] text-zinc-500">
                                {prospect.city} · {prospect.vertical}
                              </span>
                              {prospect.reviews != null && (
                                <span className="text-[10px] text-zinc-400">
                                  {prospect.reviews} ★{prospect.rating}
                                </span>
                              )}
                            </div>
                            {prospect.dm_angle && (
                              <p
                                onClick={() =>
                                  setExpanded(expanded === prospect.id ? null : prospect.id)
                                }
                                className={`text-[11px] text-zinc-500 mt-1.5 cursor-pointer ${
                                  expanded === prospect.id ? "" : "line-clamp-2"
                                }`}
                              >
                                {prospect.dm_angle}
                              </p>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
