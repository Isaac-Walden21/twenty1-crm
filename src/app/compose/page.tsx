import { getProspects } from "@/lib/db";
import { getConfiguredSenders } from "@/lib/gmail";
import { ComposeForm } from "./compose-form";

export const dynamic = "force-dynamic";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ prospect_id?: string; type?: string }>;
}) {
  const params = await searchParams;
  const prospects = getProspects();
  const senders = getConfiguredSenders();
  const anySenderReady = senders.some((s) => s.configured);

  const prospectId = params.prospect_id ? parseInt(params.prospect_id) : undefined;
  const type = params.type || "cold";
  const prefillProspect = prospectId
    ? prospects.find((p) => p.id === prospectId)
    : undefined;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compose Email</h1>
        <p className="text-zinc-500 text-sm mt-1">Send directly from the dashboard via Gmail</p>
      </div>

      {/* Sender status */}
      <div className="flex gap-3">
        {senders.map((s) => (
          <div
            key={s.name}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${
              s.configured
                ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-500"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.configured ? "bg-emerald-500" : "bg-zinc-600"}`} />
            <span className="capitalize font-medium">{s.name}</span>
            <span>{s.configured ? "connected" : "not set up"}</span>
          </div>
        ))}
      </div>

      {!anySenderReady ? (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Gmail Not Connected</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Set up at least one sender to send emails.
          </p>
          <code className="text-xs bg-zinc-800 px-3 py-2 rounded text-zinc-300">
            npm run gmail-setup isaac
          </code>
        </div>
      ) : (
        <ComposeForm
          prospects={prospects.map((p) => ({
            id: p.id,
            business_name: p.business_name,
            contact_name: p.contact_name,
            email: p.email,
            vertical: p.vertical,
            sent_by: p.sent_by,
          }))}
          senders={senders}
          prefillProspectId={prefillProspect?.id}
          prefillTo={prefillProspect?.email || ""}
          prefillType={type}
        />
      )}
    </div>
  );
}
