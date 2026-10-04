import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getPhoto } from "@/lib/db";
import { photoFilePath, contentTypeForExt } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const photo = getPhoto(Number(id));
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await fs.readFile(photoFilePath(photo.id, photo.file_ext));
  const headers: Record<string, string> = {
    "Content-Type": contentTypeForExt(photo.file_ext),
  };

  if (request.nextUrl.searchParams.get("download")) {
    const safeName = photo.display_name.replace(/"/g, "");
    headers["Content-Disposition"] = `attachment; filename="${safeName}.${photo.file_ext}"`;
  }

  return new NextResponse(new Uint8Array(buffer), { headers });
}
