import { NextRequest, NextResponse } from "next/server";
import { getProspects, updateProspectStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prospects = getProspects({
    vertical: searchParams.get("vertical") || undefined,
    status: searchParams.get("status") || undefined,
    search: searchParams.get("search") || undefined,
    sent_by: searchParams.get("sent_by") || undefined,
  });
  return NextResponse.json(prospects);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status, notes, sale_price } = body;

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  updateProspectStatus(id, status, notes, sale_price);
  return NextResponse.json({ success: true });
}
