import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { del, list, put, type ListBlobResultBlob } from "@vercel/blob";
import type { IncomingFile } from "@/lib/types";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB per photo
/** Kept under Vercel's 4.5MB function request body limit. */
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

const INCOMING_PREFIX = "incoming/";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const INCOMING_PATHNAME = new RegExp(`^incoming/${UUID}/[^/]+$`);
// Staged files are stored as numbered parts under their pathname, e.g.
// incoming/<uuid>/IMG_1.jpg/part-0-of-3, and joined back together on import.
const INCOMING_PART = new RegExp(
  `^(incoming/${UUID}/[^/]+)/part-(\\d+)-of-(\\d+)$`
);

export function isIncomingPathname(pathname: string): boolean {
  return (
    INCOMING_PATHNAME.test(pathname) &&
    !pathname.includes("..") &&
    Object.hasOwn(CONTENT_TYPES, extFromFilename(pathname))
  );
}

export function extFromFilename(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext || "jpg";
}

async function listAll(prefix: string): Promise<ListBlobResultBlob[]> {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

export async function saveIncomingChunk(
  pathname: string,
  index: number,
  total: number,
  data: Buffer
): Promise<void> {
  await put(`${pathname}/part-${index}-of-${total}`, data, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });
}

/** Lists staged files whose parts have all been uploaded. */
export async function listIncomingFiles(): Promise<IncomingFile[]> {
  const groups = new Map<string, { total: number; parts: Set<number>; size: number }>();
  for (const blob of await listAll(INCOMING_PREFIX)) {
    const match = blob.pathname.match(INCOMING_PART);
    if (!match) continue;
    const [, pathname, index, total] = match;
    const group = groups.get(pathname) ?? {
      total: Number(total),
      parts: new Set<number>(),
      size: 0,
    };
    group.parts.add(Number(index));
    group.size += blob.size;
    groups.set(pathname, group);
  }

  const files: IncomingFile[] = [];
  for (const [pathname, group] of groups) {
    if (group.parts.size !== group.total) continue;
    files.push({
      pathname,
      name: path.posix.basename(pathname),
      size: group.size,
    });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function listIncomingParts(pathname: string): Promise<ListBlobResultBlob[]> {
  return (await listAll(`${pathname}/`)).filter((b) =>
    INCOMING_PART.test(b.pathname)
  );
}

export async function removeIncomingFile(pathname: string): Promise<void> {
  if (!isIncomingPathname(pathname)) return;
  await deleteBlobs((await listIncomingParts(pathname)).map((b) => b.url));
}

export async function clearIncomingFiles(): Promise<void> {
  await deleteBlobs((await listAll(INCOMING_PREFIX)).map((b) => b.url));
}

async function readIncomingFile(
  pathname: string
): Promise<{ buffer: Buffer; partUrls: string[] }> {
  const parts = (await listIncomingParts(pathname))
    .map((blob) => {
      const [, , index, total] = blob.pathname.match(INCOMING_PART)!;
      return { url: blob.url, index: Number(index), total: Number(total) };
    })
    .sort((a, b) => a.index - b.index);

  const total = parts[0]?.total ?? 0;
  if (
    parts.length === 0 ||
    parts.length !== total ||
    parts.some((p, i) => p.index !== i || p.total !== total)
  ) {
    throw new Error("Upload is incomplete. Remove it and upload it again.");
  }

  const buffers = await Promise.all(
    parts.map(async (part) => {
      const res = await fetch(part.url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Could not read upload (status ${res.status})`);
      }
      return Buffer.from(await res.arrayBuffer());
    })
  );
  return { buffer: Buffer.concat(buffers), partUrls: parts.map((p) => p.url) };
}

/**
 * Copies a staged upload into permanent storage, generates its thumbnail, and
 * reads its metadata. The staged parts are left in place; the caller removes
 * them with `deleteBlobs(partUrls)` once the photo is saved.
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
  partUrls: string[];
}> {
  const { buffer, partUrls } = await readIncomingFile(pathname);

  const name = path.posix.basename(pathname);
  const ext = extFromFilename(name);
  const key = crypto.randomUUID();

  const thumbnail = await sharp(buffer)
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const results = await Promise.allSettled([
    put(`photos/${key}.${ext}`, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: CONTENT_TYPES[ext],
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

  return {
    partUrls,
    name,
    ext,
    size: buffer.length,
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
