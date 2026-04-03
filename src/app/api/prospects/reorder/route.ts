import { NextRequest, NextResponse } from "next/server";
import { updateProspectStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { id, status } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }
  await updateProspectStatus(id, status);
  return NextResponse.json({ success: true });
}
