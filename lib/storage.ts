import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { copy, del, head, list, put } from "@vercel/blob";
import type { IncomingFile } from "@/lib/types";

export const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB per photo

const INCOMING_PREFIX = "incoming/";
const INCOMING_PATHNAME =
  /^incoming\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/;

export function isIncomingPathname(pathname: string): boolean {
  return INCOMING_PATHNAME.test(pathname) && !pathname.includes("..");
}

export function extFromFilename(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext || "jpg";
}

export async function listIncomingFiles(): Promise<IncomingFile[]> {
  const files: IncomingFile[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: INCOMING_PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      if (!isIncomingPathname(blob.pathname)) continue;
      files.push({
        pathname: blob.pathname,
        name: path.posix.basename(blob.pathname),
        size: blob.size,
      });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function removeIncomingFile(pathname: string): Promise<void> {
  if (!isIncomingPathname(pathname)) return;
  await del(pathname);
}

export async function clearIncomingFiles(): Promise<void> {
  const files = await listIncomingFiles();
  if (files.length > 0) await del(files.map((f) => f.pathname));
}

/**
 * Moves a staged upload into permanent storage, generates its thumbnail, and
 * reads its metadata. The staged blob is removed once both copies exist.
 */
export async function promoteIncomingFile(pathname: string): Promise<{
  name: string;
  ext: string;
  size: number;
  photoUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  originalCreatedAt: string | null;
}> {
  const incoming = await head(pathname);
  const res = await fetch(incoming.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read upload (status ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const name = path.posix.basename(pathname);
  const ext = extFromFilename(name);
  const key = crypto.randomUUID();

  const thumbnail = await sharp(buffer)
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const results = await Promise.allSettled([
    copy(incoming.url, `photos/${key}.${ext}`, {
      access: "public",
      addRandomSuffix: true,
      contentType: incoming.contentType,
    }),
    put(`thumbnails/${key}.webp`, thumbnail, {
      access: "public",
      addRandomSuffix: true,
      contentType: "image/webp",
    }),
  ]);
  const failure = results.find((r) => r.status === "rejected");
  if (failure) {
    await deleteBlobs(
      results.map((r) => (r.status === "fulfilled" ? r.value.url : ""))
    );
    throw failure.reason;
  }
  const [photoBlob, thumbnailBlob] = results.map(
    (r) => (r as PromiseFulfilledResult<{ url: string }>).value
  );

  const metadata = await getImageMetadata(buffer);
  await del(incoming.url);

  return {
    name,
    ext,
    size: incoming.size,
    photoUrl: photoBlob.url,
    thumbnailUrl: thumbnailBlob.url,
    ...metadata,
  };
}

export async function deleteBlobs(urls: string[]): Promise<void> {
  const present = urls.filter(Boolean);
  if (present.length > 0) await del(present);
}

function normalizeImageDate(raw: string): string | null {
  const match = raw
    .trim()
    .match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

function readExifAscii(
  view: Buffer,
  littleEndian: boolean,
  entryOffset: number
): string | null {
  const type = littleEndian
    ? view.readUInt16LE(entryOffset + 2)
    : view.readUInt16BE(entryOffset + 2);
  const count = littleEndian
    ? view.readUInt32LE(entryOffset + 4)
    : view.readUInt32BE(entryOffset + 4);
  if (type !== 2 || count === 0) return null;

  const start =
    count <= 4
      ? entryOffset + 8
      : littleEndian
        ? view.readUInt32LE(entryOffset + 8)
        : view.readUInt32BE(entryOffset + 8);
  if (start < 0 || start + count > view.length) return null;
  return view.toString("latin1", start, start + count).replace(/\0+$/, "").trim();
}

function findExifTag(
  view: Buffer,
  littleEndian: boolean,
  ifdOffset: number,
  tag: number
): number | null {
  if (ifdOffset < 0 || ifdOffset + 2 > view.length) return null;
  const count = littleEndian
    ? view.readUInt16LE(ifdOffset)
    : view.readUInt16BE(ifdOffset);
  for (let i = 0; i < count; i++) {
    const entry = ifdOffset + 2 + i * 12;
    if (entry + 12 > view.length) return null;
    const entryTag = littleEndian
      ? view.readUInt16LE(entry)
      : view.readUInt16BE(entry);
    if (entryTag === tag) return entry;
  }
  return null;
}

function readExifTagAscii(
  view: Buffer,
  littleEndian: boolean,
  ifdOffset: number,
  tag: number
): string | null {
  const entry = findExifTag(view, littleEndian, ifdOffset, tag);
  if (entry == null) return null;
  return readExifAscii(view, littleEndian, entry);
}

function parseExifTiff(exif: Buffer): Buffer | null {
  let offset = 0;
  if (exif.length >= 6 && exif.toString("ascii", 0, 4) === "Exif") offset = 6;
  const view = exif.subarray(offset);
  if (view.length < 8) return null;
  const endian = view.toString("ascii", 0, 2);
  if (endian !== "II" && endian !== "MM") return null;
  return view;
}

function parseExifDate(
  exif: Buffer | undefined,
  tags: number[]
): string | null {
  if (!exif) return null;
  const view = parseExifTiff(exif);
  if (!view) return null;
  const littleEndian = view.toString("ascii", 0, 2) === "II";
  const ifd0 = littleEndian ? view.readUInt32LE(4) : view.readUInt32BE(4);
  const exifPointer = findExifTag(view, littleEndian, ifd0, 0x8769);
  const exifIfd =
    exifPointer == null
      ? null
      : littleEndian
        ? view.readUInt32LE(exifPointer + 8)
        : view.readUInt32BE(exifPointer + 8);

  for (const tag of tags) {
    const raw =
      (exifIfd != null
        ? readExifTagAscii(view, littleEndian, exifIfd, tag)
        : null) || readExifTagAscii(view, littleEndian, ifd0, tag);
    const normalized = raw ? normalizeImageDate(raw) : null;
    if (normalized) return normalized;
  }
  return null;
}

function parseXmpOriginalDate(xmp: string | undefined): string | null {
  if (!xmp) return null;
  const patterns = [
    /photoshop:DateCreated="([^"]+)"/,
    /xmp:CreateDate="([^"]+)"/,
    /exif:DateTimeOriginal="([^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = xmp.match(pattern);
    if (!match?.[1]) continue;
    const normalized = normalizeImageDate(match[1]);
    if (normalized) return normalized;
  }
  return null;
}

export async function getImageMetadata(image: Buffer): Promise<{
  width: number | null;
  height: number | null;
  originalCreatedAt: string | null;
}> {
  try {
    const metadata = await sharp(image).metadata();
    const originalCreatedAt =
      parseExifDate(metadata.exif, [0x9003, 0x9004]) ||
      parseXmpOriginalDate(metadata.xmpAsString) ||
      parseExifDate(metadata.exif, [0x0132]);
    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      originalCreatedAt,
    };
  } catch {
    return { width: null, height: null, originalCreatedAt: null };
  }
}
