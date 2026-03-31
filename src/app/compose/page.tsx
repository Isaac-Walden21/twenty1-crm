import { getProspects } from "@/lib/db";
import { ComposeForm } from "./compose-form";

export const dynamic = "force-dynamic";

const SENDERS = [
  { name: "isaac", configured: true },
  { name: "asher", configured: true },
];

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ prospect_id?: string; type?: string }>;
}) {
  const params = await searchParams;
  const prospects = getProspects();

  const prospectId = params.prospect_id ? parseInt(params.prospect_id) : undefined;
  const type = params.type || "cold";
  const prefillProspect = prospectId
    ? prospects.find((p) => p.id === prospectId)
    : undefined;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compose Email</h1>
        <p className="text-zinc-500 text-sm mt-1">Send directly from the dashboard via Resend</p>
      </div>

      {/* Sender status */}
      <div className="flex gap-3">
        {SENDERS.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border bg-emerald-950/30 border-emerald-800/50 text-emerald-400"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="capitalize font-medium">{s.name}</span>
            <span>ready</span>
          </div>
        ))}
      </div>

      <ComposeForm
        prospects={prospects.map((p) => ({
          id: p.id,
          business_name: p.business_name,
          contact_name: p.contact_name,
          email: p.email,
          vertical: p.vertical,
          sent_by: p.sent_by,
        }))}
        senders={SENDERS}
        prefillProspectId={prefillProspect?.id}
        prefillTo={prefillProspect?.email || ""}
        prefillType={type}
      />
    </div>
  );
}
