import { NextRequest, NextResponse } from "next/server";
import { getPhoto, updatePhoto, deletePhoto } from "@/lib/db";
import { deletePhotoFiles } from "@/lib/storage";
import { ensureOriginalCreatedAt } from "@/lib/imageCreatedAt";
import { parseProductUpdates } from "@/lib/parseProductUpdates";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const existing = getPhoto(Number(id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const photo = await ensureOriginalCreatedAt(existing);
  return NextResponse.json({ photo });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const photoId = Number(id);
  const existing = getPhoto(photoId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const photo = updatePhoto(photoId, parseProductUpdates(body));
  return NextResponse.json({ photo });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const photoId = Number(id);
  const photo = getPhoto(photoId);
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deletePhotoFiles(photo.id, photo.file_ext);
  deletePhoto(photoId);
  return NextResponse.json({ ok: true });
}
