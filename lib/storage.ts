import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import AdmZip from "adm-zip";
import type { IncomingFile } from "@/lib/types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const PHOTOS_DIR = path.join(DATA_DIR, "photos");
export const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");
export const INCOMING_DIR = path.join(DATA_DIR, "incoming");

export function ensureDirs(): void {
  for (const dir of [DATA_DIR, PHOTOS_DIR, THUMBNAILS_DIR, INCOMING_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export function contentTypeForExt(ext: string): string {
  return CONTENT_TYPES[ext.toLowerCase()] || "application/octet-stream";
}

export function extFromFilename(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext || "jpg";
}

export function photoFilePath(id: number, ext: string): string {
  return path.join(PHOTOS_DIR, `${id}.${ext}`);
}

export function thumbnailFilePath(id: number): string {
  return path.join(THUMBNAILS_DIR, `${id}.webp`);
}

/** Sanitizes an uploaded filename to a safe basename with no path segments. */
function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "_");
  return base || "file";
}

export async function listIncomingFiles(): Promise<IncomingFile[]> {
  ensureDirs();
  const entries = await fsp.readdir(INCOMING_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile());
  const stats = await Promise.all(
    files.map(async (e) => {
      const stat = await fsp.stat(path.join(INCOMING_DIR, e.name));
      return { name: e.name, size: stat.size };
    })
  );
  return stats.sort((a, b) => a.name.localeCompare(b.name));
}

/** Writes a buffer into the incoming staging directory, avoiding name collisions. */
export async function writeIncomingFile(
  originalName: string,
  buffer: Buffer
): Promise<string> {
  ensureDirs();
  const safeName = sanitizeFilename(originalName);
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);

  let candidate = safeName;
  let counter = 2;
  while (
    await fsp
      .access(path.join(INCOMING_DIR, candidate))
      .then(() => true)
      .catch(() => false)
  ) {
    candidate = `${base}-${counter}${ext}`;
    counter += 1;
  }

  await fsp.writeFile(path.join(INCOMING_DIR, candidate), buffer);
  return candidate;
}

/**
 * Extracts image entries from a zip archive (e.g. a Google Drive folder
 * export) into the incoming staging directory. Non-image entries, folders,
 * and junk files like __MACOSX/.DS_Store are silently skipped.
 */
export async function extractZipToIncoming(
  buffer: Buffer
): Promise<{ saved: string[]; skipped: number }> {
  ensureDirs();
  const zip = new AdmZip(buffer);
  const saved: string[] = [];
  let skipped = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (entry.entryName.startsWith("__MACOSX/")) continue;
    if (entry.name.startsWith(".")) continue;

    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      skipped += 1;
      continue;
    }

    const name = await writeIncomingFile(entry.name, entry.getData());
    saved.push(name);
  }

  return { saved, skipped };
}

export async function removeIncomingFile(name: string): Promise<void> {
  const safeName = sanitizeFilename(name);
  await fsp.rm(path.join(INCOMING_DIR, safeName), { force: true });
}

export async function clearIncomingFiles(): Promise<void> {
  const files = await listIncomingFiles();
  await Promise.all(files.map((f) => removeIncomingFile(f.name)));
}

export async function readIncomingFile(name: string): Promise<Buffer> {
  const safeName = sanitizeFilename(name);
  return fsp.readFile(path.join(INCOMING_DIR, safeName));
}

/** Moves a staged incoming file into permanent photo storage under its catalog id. */
export async function moveIncomingToPhoto(
  incomingName: string,
  id: number,
  ext: string
): Promise<void> {
  const safeName = sanitizeFilename(incomingName);
  ensureDirs();
  await fsp.rename(
    path.join(INCOMING_DIR, safeName),
    photoFilePath(id, ext)
  );
}

export async function generateThumbnail(id: number, ext: string): Promise<void> {
  ensureDirs();
  await sharp(photoFilePath(id, ext))
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbnailFilePath(id));
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

export async function getImageMetadata(filePath: string): Promise<{
  width: number | null;
  height: number | null;
  originalCreatedAt: string | null;
}> {
  try {
    const metadata = await sharp(filePath).metadata();
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

export async function deletePhotoFiles(id: number, ext: string): Promise<void> {
  await Promise.all([
    fsp.rm(photoFilePath(id, ext), { force: true }),
    fsp.rm(thumbnailFilePath(id), { force: true }),
  ]);
}
