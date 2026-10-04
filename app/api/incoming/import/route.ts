import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import {
  insertPhoto,
  deletePhoto,
  updatePhoto,
  updatePhotoDimensions,
  updatePhotoOriginalCreatedAt,
} from "@/lib/db";
import {
  listIncomingFiles,
  moveIncomingToPhoto,
  generateThumbnail,
  getImageMetadata,
  extFromFilename,
  photoFilePath,
} from "@/lib/storage";
import { parseProductUpdates } from "@/lib/parseProductUpdates";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updates = parseProductUpdates(body);
  const files = await listIncomingFiles();
  let importedCount = 0;
  const failed: { name: string; error: string }[] = [];

  for (const file of files) {
    const ext = extFromFilename(file.name);
    const displayName = path.basename(file.name, path.extname(file.name));

    const photo = insertPhoto({
      display_name: updates.display_name || displayName,
      original_filename: file.name,
      category: "Uncategorized",
      file_ext: ext,
      file_size: file.size,
      width: null,
      height: null,
    });

    try {
      await moveIncomingToPhoto(file.name, photo.id, ext);
      const { width, height, originalCreatedAt } = await getImageMetadata(
        photoFilePath(photo.id, ext)
      );
      updatePhotoDimensions(photo.id, width, height);
      updatePhotoOriginalCreatedAt(photo.id, originalCreatedAt ?? "");
      const fieldUpdates = { ...updates };
      delete fieldUpdates.display_name;
      if (Object.keys(fieldUpdates).length > 0) {
        updatePhoto(photo.id, fieldUpdates);
      }
      await generateThumbnail(photo.id, ext);
      importedCount += 1;
    } catch (err) {
      deletePhoto(photo.id);
      failed.push({ name: file.name, error: (err as Error).message });
    }
  }

  return NextResponse.json({ imported: importedCount, failed });
}
