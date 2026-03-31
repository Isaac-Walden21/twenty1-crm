import { getProspectById, getProspectThread, type ThreadMessage } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusUpdater } from "../status-updater";

export const dynamic = "force-dynamic";

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospect = getProspectById(parseInt(id));
  if (!prospect) return notFound();

  const thread = getProspectThread(prospect.id);
  const sentCount = thread.filter((m) => m.direction === "sent").length;
  const receivedCount = thread.filter((m) => m.direction === "received").length;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <Link href="/prospects" className="text-sm text-zinc-500 hover:text-white transition-colors">
        &larr; Back
      </Link>

      {/* Prospect header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{prospect.business_name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-zinc-400">
              {prospect.contact_name && <span>{prospect.contact_name}</span>}
              {prospect.city && prospect.state && (
                <span className="text-zinc-600">{prospect.city}, {prospect.state}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-zinc-500">
              <span className="break-all">{prospect.email}</span>
              {prospect.phone && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span>{prospect.phone}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
            <StatusUpdater id={prospect.id} currentStatus={prospect.status} currentNotes={prospect.notes || ""} />
            <Link
              href={`/compose?prospect_id=${prospect.id}&type=${sentCount === 0 ? "cold" : "followup"}`}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Send Email
            </Link>
            <span className="text-xs text-zinc-600">Est. ${prospect.price_estimate?.toLocaleString() || "—"}</span>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-zinc-800">
          <MetaBadge label="Vertical" value={prospect.vertical || "—"} />
          <MetaBadge label="Sender" value={prospect.sent_by || "isaac"} />
          <MetaBadge label="Sent" value={String(sentCount)} />
          <MetaBadge label="Replies" value={String(receivedCount)} />
          <MetaBadge label="Updated" value={prospect.updated_at?.split("T")[0] || "—"} />
        </div>

        {prospect.notes && (
          <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Notes</span>
            <p className="text-sm text-zinc-300 mt-1">{prospect.notes}</p>
          </div>
        )}
      </div>

      {/* Thread */}
      <div>
        <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
          Thread
          <span className="text-sm text-zinc-500 font-normal ml-2">
            {thread.length} message{thread.length !== 1 ? "s" : ""}
          </span>
        </h2>

        {thread.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            No messages yet.
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {thread.map((msg) => (
              <ThreadBubble key={`${msg.direction}-${msg.id}`} msg={msg} prospectEmail={prospect.email || ""} senderName={prospect.sent_by || "isaac"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadBubble({
  msg,
  prospectEmail,
  senderName,
}: {
  msg: ThreadMessage;
  prospectEmail: string;
  senderName: string;
}) {
  const isSent = msg.direction === "sent";

  return (
    <div className={`flex ${isSent ? "justify-start" : "justify-end"}`}>
      <div
        className={`w-full sm:max-w-[85%] rounded-xl p-3 sm:p-4 ${
          isSent
            ? "bg-zinc-900 border border-zinc-800"
            : "bg-indigo-950/50 border border-indigo-800/50"
        }`}
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {isSent ? (
            <>
              <SenderAvatar name={senderName} />
              <span className="text-sm font-medium text-white capitalize">{msg.sender || senderName}</span>
              <span className="text-xs text-zinc-500">
                {msg.type === "followup" ? "Follow-up" : "Cold Email"}
              </span>
            </>
          ) : (
            <>
              <ReceiverAvatar />
              <span className="text-sm font-medium text-indigo-300 break-all">{prospectEmail}</span>
              {msg.response_type && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  msg.response_type === "interested" ? "bg-emerald-500/20 text-emerald-300" :
                  msg.response_type === "not_interested" ? "bg-red-500/20 text-red-300" :
                  msg.response_type === "unsubscribe" ? "bg-red-700/20 text-red-400" :
                  "bg-blue-500/20 text-blue-300"
                }`}>
                  {msg.response_type.replace(/_/g, " ")}
                </span>
              )}
            </>
          )}
          <span className="text-xs text-zinc-600 ml-auto">{msg.date || "—"}</span>
        </div>

        {msg.subject && (
          <div className="text-xs text-zinc-400 mb-2 font-medium break-words">{msg.subject}</div>
        )}

        {msg.body ? (
          <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed break-words">
            {msg.body}
          </div>
        ) : (
          <div className="text-sm text-zinc-600 italic">(email body not available)</div>
        )}

        {isSent && msg.status && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-800/50 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              msg.status === "sent" ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"
            }`}>
              {msg.status}
            </span>
            {msg.message_id && (
              <span className="text-[10px] text-zinc-700 font-mono truncate max-w-[200px]">{msg.message_id}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SenderAvatar({ name }: { name: string }) {
  return (
    <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold uppercase shrink-0">
      {name[0]}
    </div>
  );
}

function ReceiverAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
      R
    </div>
  );
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-zinc-600 uppercase tracking-wider block">{label}</span>
      <span className="text-sm text-zinc-300 capitalize">{value}</span>
    </div>
  );
}
