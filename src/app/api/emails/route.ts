import { NextRequest, NextResponse } from "next/server";
import { getEmails } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const emails = await getEmails({
    type: searchParams.get("type") || undefined,
    status: searchParams.get("status") || undefined,
    sent_by: searchParams.get("sent_by") || undefined,
  });
  return NextResponse.json(emails);
}
