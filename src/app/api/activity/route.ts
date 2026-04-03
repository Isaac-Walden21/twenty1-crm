import { NextRequest, NextResponse } from "next/server";
import { getActivityFeed } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const feed = await getActivityFeed(limit, offset);
  return NextResponse.json(feed);
}
