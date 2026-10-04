import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { insertPhoto, updatePhoto } from "@/lib/db";
import {
  deleteBlobs,
  isIncomingPathname,
  promoteIncomingFile,
} from "@/lib/storage";
import { parseProductUpdates } from "@/lib/parseProductUpdates";

export const maxDuration = 60;

/** Imports one staged file; the client calls this once per file. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const pathname = body.pathname;
  if (typeof pathname !== "string" || !isIncomingPathname(pathname)) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  const updates = parseProductUpdates(body);
  delete updates.display_name;

  let promoted: Awaited<ReturnType<typeof promoteIncomingFile>>;
  try {
    promoted = await promoteIncomingFile(pathname);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }

  try {
    const photo = await insertPhoto({
      display_name: path.basename(promoted.name, path.extname(promoted.name)),
      original_filename: promoted.name,
      file_ext: promoted.ext,
      file_size: promoted.size,
      photo_url: promoted.photoUrl,
      thumbnail_url: promoted.thumbnailUrl,
      width: promoted.width,
      height: promoted.height,
      original_created_at: promoted.originalCreatedAt ?? "",
    });
    const saved =
      Object.keys(updates).length > 0
        ? await updatePhoto(photo.id, updates)
        : photo;
    return NextResponse.json({ photo: saved });
  } catch (err) {
    await deleteBlobs([promoted.photoUrl, promoted.thumbnailUrl]);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
