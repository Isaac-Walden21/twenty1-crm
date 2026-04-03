import { getProspects } from "@/lib/db";
import { KanbanBoard } from "./kanban-board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const prospects = await getProspects();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Pipeline</h1>
        <p className="text-zinc-500 text-sm mt-1">Drag prospects between stages</p>
      </div>
      <KanbanBoard
        prospects={prospects.map((p) => ({
          id: p.id,
          business_name: p.business_name,
          contact_name: p.contact_name,
          email: p.email,
          vertical: p.vertical,
          price_estimate: p.price_estimate,
          sale_price: p.sale_price,
          status: p.status,
        }))}
      />
    </div>
  );
}
