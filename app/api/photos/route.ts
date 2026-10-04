import { NextRequest, NextResponse } from "next/server";
import { listPhotos } from "@/lib/db";
import { startOriginalCreatedAtBackfill } from "@/lib/imageCreatedAt";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const interiorPages =
    request.nextUrl.searchParams.get("interior_pages") ?? undefined;
  startOriginalCreatedAtBackfill();
  const photos = listPhotos({ q, interior_pages: interiorPages });
  return NextResponse.json({ photos });
}
