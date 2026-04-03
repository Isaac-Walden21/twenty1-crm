"use client";

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type Prospect = {
  id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  vertical: string | null;
  price_estimate: number | null;
  sale_price: number | null;
};

const COLUMNS = [
  { id: "prospected", label: "Prospected", color: "border-zinc-700" },
  { id: "followed_up", label: "Followed Up", color: "border-blue-700" },
  { id: "active_lead", label: "Active Lead", color: "border-emerald-700" },
  { id: "negotiating", label: "Negotiating", color: "border-amber-700" },
  { id: "closed_won", label: "Closed Won", color: "border-green-700" },
  { id: "closed_lost", label: "Closed Lost", color: "border-red-800" },
];

export function KanbanBoard({ prospects }: { prospects: (Prospect & { status: string })[] }) {
  const router = useRouter();
  const [items, setItems] = useState(prospects);
  const [saving, setSaving] = useState<number | null>(null);

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: items.filter((p) => p.status === col.id),
    total: items
      .filter((p) => p.status === col.id)
      .reduce((sum, p) => sum + (p.status === "closed_won" ? (p.sale_price || 0) : (p.price_estimate || 0)), 0),
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
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-12rem)]">
        {columns.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-64 sm:w-72">
            <div className={`border-t-2 ${col.color} bg-zinc-900 rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-300">{col.label}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">{col.items.length}</span>
                  {col.total > 0 && (
                    <span className="text-[10px] text-zinc-500">${col.total.toLocaleString()}</span>
                  )}
                </div>
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
                            <Link href={`/prospects/${prospect.id}`} className="text-sm font-medium text-white hover:text-emerald-400 transition-colors">
                              {prospect.business_name}
                            </Link>
                            {prospect.contact_name && (
                              <p className="text-xs text-zinc-500 mt-0.5">{prospect.contact_name}</p>
                            )}
                            <div className="flex items-center justify-between mt-2">
                              {prospect.vertical && (
                                <span className="text-[10px] text-zinc-500">{prospect.vertical}</span>
                              )}
                              <span className="text-xs text-zinc-400">
                                ${(prospect.status === "closed_won" ? prospect.sale_price : prospect.price_estimate)?.toLocaleString() || "\u2014"}
                              </span>
                            </div>
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
