import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getPhoto } from "@/lib/db";
import { thumbnailFilePath } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const photo = getPhoto(Number(id));
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await fs.readFile(thumbnailFilePath(photo.id));
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
