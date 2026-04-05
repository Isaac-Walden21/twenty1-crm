import { NextRequest, NextResponse } from "next/server";
import { getProspectThread } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const thread = await getProspectThread(parseInt(id));
  return NextResponse.json(thread);
}
