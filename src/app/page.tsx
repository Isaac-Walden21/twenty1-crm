import { getProspects } from "@/lib/db";
import { KanbanBoard } from "./kanban-board";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const prospects = await getProspects();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Pipeline</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Drag leads between stages. Click a card&apos;s angle to expand it.
        </p>
      </div>
      <KanbanBoard
        prospects={prospects.map((p) => ({
          id: p.id,
          business_name: p.business_name,
          city: p.city,
          vertical: p.vertical,
          instagram_handle: p.instagram_handle,
          dm_angle: p.dm_angle,
          reviews: p.reviews,
          rating: p.rating,
          status: p.status,
        }))}
      />
    </div>
  );
}
