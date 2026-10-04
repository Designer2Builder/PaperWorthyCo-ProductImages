import { NextRequest, NextResponse } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import { del, list, put } from "@vercel/blob";
import { getPhotos } from "@/lib/db";
import type { Photo } from "@/lib/types";

export const maxDuration = 300;

const DOWNLOADS_PREFIX = "downloads/";
const DOWNLOAD_TTL_MS = 60 * 60 * 1000;

async function deleteExpiredDownloads(): Promise<void> {
  const { blobs } = await list({ prefix: DOWNLOADS_PREFIX, limit: 1000 });
  const cutoff = Date.now() - DOWNLOAD_TTL_MS;
  const expired = blobs
    .filter((b) => b.uploadedAt.getTime() < cutoff)
    .map((b) => b.url);
  if (expired.length > 0) await del(expired);
}

function zipFilenames(photos: Photo[]): string[] {
  const used = new Set<string>();
  return photos.map((photo) => {
    const base = photo.display_name.replace(/[\\/:*?"<>|]+/g, "_") || "photo";
    let filename = `${base}.${photo.file_ext}`;
    let counter = 2;
    while (used.has(filename)) {
      filename = `${base}-${counter}.${photo.file_ext}`;
      counter += 1;
    }
    used.add(filename);
    return filename;
  });
}

/**
 * Streams the selected photos into a zip stored in Blob and returns its
 * download URL, since Vercel caps function responses at 4.5MB.
 */
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

  const photos = await getPhotos(ids.map(Number));
  if (photos.length === 0) {
    return NextResponse.json({ error: "No photos found" }, { status: 404 });
  }

  await deleteExpiredDownloads().catch(() => {});

  const zip = new Zip();
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });
  zip.ondata = (err, chunk, final) => {
    if (err) {
      streamController.error(err);
      return;
    }
    streamController.enqueue(chunk);
    if (final) streamController.close();
  };

  const filenames = zipFilenames(photos);
  const fill = (async () => {
    for (const [i, photo] of photos.entries()) {
      const entry = new ZipPassThrough(filenames[i]);
      zip.add(entry);
      const res = await fetch(photo.photo_url, { cache: "no-store" });
      if (!res.ok || !res.body) {
        throw new Error(`Could not read "${photo.display_name}"`);
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        entry.push(value);
      }
      entry.push(new Uint8Array(0), true);
    }
    zip.end();
  })().catch((err: unknown) => {
    zip.terminate();
    streamController.error(err);
    throw err;
  });

  try {
    const [blob] = await Promise.all([
      put(`${DOWNLOADS_PREFIX}photos.zip`, body, {
        access: "public",
        addRandomSuffix: true,
        contentType: "application/zip",
        multipart: true,
      }),
      fill,
    ]);
    return NextResponse.json({ url: blob.downloadUrl });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
