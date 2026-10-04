import { NextRequest, NextResponse } from "next/server";
import { getPhoto, updatePhoto, deletePhoto } from "@/lib/db";
import { deleteBlobs } from "@/lib/storage";
import { parseProductUpdates } from "@/lib/parseProductUpdates";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const photo = await getPhoto(Number(id));
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ photo });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const photoId = Number(id);
  const existing = await getPhoto(photoId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const photo = await updatePhoto(photoId, parseProductUpdates(body));
  return NextResponse.json({ photo });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const photoId = Number(id);
  const photo = await getPhoto(photoId);
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deletePhoto(photoId);
  await deleteBlobs([photo.photo_url, photo.thumbnail_url]);
  return NextResponse.json({ ok: true });
}
