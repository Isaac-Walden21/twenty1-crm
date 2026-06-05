import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export { supabase };

export interface ProspectRow {
  id: number;
  business_name: string;
  city: string | null;
  state: string | null;
  vertical: string | null;
  status: string;
  instagram_handle: string | null;
  website: string | null;
  phone: string | null;
  dm_angle: string | null;
  reviews: number | null;
  rating: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getProspects(): Promise<ProspectRow[]> {
  const { data } = await supabase
    .from("prospects")
    .select("*")
    .order("reviews", { ascending: false });
  return (data || []) as ProspectRow[];
}

export async function updateProspectStatus(id: number, status: string) {
  await supabase
    .from("prospects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  await supabase.from("activity_log").insert({
    prospect_id: id,
    event_type: "status_change",
    event_data: { new_status: status },
  });
}
