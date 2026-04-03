import { NextRequest, NextResponse } from "next/server";
import { getSavedFilters, createSavedFilter, deleteSavedFilter } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const filters = await getSavedFilters();
  return NextResponse.json(filters);
}

export async function POST(req: NextRequest) {
  const { name, filters } = await req.json();
  if (!name || !filters) {
    return NextResponse.json({ error: "name and filters required" }, { status: 400 });
  }
  await createSavedFilter(name, filters);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await deleteSavedFilter(id);
  return NextResponse.json({ success: true });
}
