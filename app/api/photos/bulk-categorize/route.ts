import { NextRequest, NextResponse } from "next/server";
import { bulkUpdateInteriorPages } from "@/lib/db";
import { isInteriorPages } from "@/lib/productFields";

export async function POST(request: NextRequest) {
  let body: { ids?: unknown; interior_pages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { ids, interior_pages } = body;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    typeof interior_pages !== "string" ||
    !isInteriorPages(interior_pages)
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  bulkUpdateInteriorPages(ids.map(Number), interior_pages);
  return NextResponse.json({ ok: true });
}
