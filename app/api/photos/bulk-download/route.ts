import { NextRequest, NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { getPhotos } from "@/lib/db";
import { photoFilePath } from "@/lib/storage";

export async function POST(request: NextRequest) {
  let ids: unknown;
  try {
    ({ ids } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No photos selected" }, { status: 400 });
  }

  const photos = getPhotos(ids.map(Number));
  if (photos.length === 0) {
    return NextResponse.json({ error: "No photos found" }, { status: 404 });
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const usedNames = new Set<string>();

  for (const photo of photos) {
    let filename = `${photo.display_name}.${photo.file_ext}`;
    let counter = 2;
    while (usedNames.has(filename)) {
      filename = `${photo.display_name}-${counter}.${photo.file_ext}`;
      counter += 1;
    }
    usedNames.add(filename);
    archive.file(photoFilePath(photo.id, photo.file_ext), { name: filename });
  }

  archive.finalize();

  const webStream = Readable.toWeb(
    archive as unknown as Readable
  ) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="photos.zip"',
    },
  });
}
