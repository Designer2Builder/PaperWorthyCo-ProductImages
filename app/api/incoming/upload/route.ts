import { NextRequest, NextResponse } from "next/server";
import {
  MAX_CHUNK_BYTES,
  MAX_UPLOAD_BYTES,
  isIncomingPathname,
  saveIncomingChunk,
} from "@/lib/storage";

/**
 * Receives one piece of a photo. The browser splits photos into pieces small
 * enough for Vercel's 4.5MB request limit, and import joins them back up.
 */
export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const pathname = params.get("pathname") ?? "";
  const index = Number(params.get("index"));
  const total = Number(params.get("total"));
  const maxParts = Math.ceil(MAX_UPLOAD_BYTES / MAX_CHUNK_BYTES);

  if (
    !isIncomingPathname(pathname) ||
    !Number.isInteger(total) ||
    total < 1 ||
    total > maxParts ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= total
  ) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: "Invalid upload size" }, { status: 400 });
  }

  try {
    await saveIncomingChunk(pathname, index, total, data);
  } catch (err) {
    console.error("Saving upload chunk failed:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
