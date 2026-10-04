import "server-only";
import fs from "node:fs";
import {
  createClient,
  type Client,
  type InValue,
  type ResultSet,
} from "@libsql/client";
import { parseColors } from "@/lib/productFields";
import type { Photo } from "@/lib/types";

const LOCAL_DB_URL = "file:data/catalog.db";

function databaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return url;
  if (process.env.VERCEL) {
    throw new Error("TURSO_DATABASE_URL environment variable is not set");
  }
  fs.mkdirSync("data", { recursive: true });
  return LOCAL_DB_URL;
}

// Created on first use so builds don't need database credentials.
let client: Client | null = null;

function getClient(): Client {
  client ??= createClient({
    url: databaseUrl(),
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return client;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    series_name TEXT NOT NULL DEFAULT '',
    series_release_date TEXT,
    colors TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    photo_type TEXT NOT NULL DEFAULT '',
    page_number INTEGER,
    notebook_type TEXT NOT NULL DEFAULT '',
    notebook_count TEXT NOT NULL DEFAULT '',
    interior_pages TEXT NOT NULL DEFAULT '',
    retail_price REAL,
    wholesale_price REAL,
    wholesale_minimum INTEGER,
    cogs REAL,
    inventory INTEGER,
    inventory_check_date TEXT,
    raw_material TEXT NOT NULL DEFAULT '',
    file_ext TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    original_created_at TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_photos_interior_pages ON photos(interior_pages);
  CREATE INDEX IF NOT EXISTS idx_photos_imported_at ON photos(imported_at);
`;

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  schemaReady ??= getClient().executeMultiple(SCHEMA).catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

async function execute(
  sql: string,
  args: InValue[] | Record<string, InValue> = []
): Promise<ResultSet> {
  await ensureSchema();
  return getClient().execute({ sql, args });
}

interface PhotoRow extends Omit<Photo, "colors"> {
  colors: string;
}

function rowsToPhotos(result: ResultSet): Photo[] {
  return result.rows.map((row) => {
    const record = Object.fromEntries(
      result.columns.map((column, i) => [column, row[i]])
    ) as unknown as PhotoRow;
    return { ...record, colors: parseColors(record.colors) };
  });
}

export interface PhotoFilters {
  q?: string;
  interior_pages?: string;
}

export async function listPhotos(filters: PhotoFilters = {}): Promise<Photo[]> {
  const clauses: string[] = [];
  const args: Record<string, InValue> = {};

  if (filters.q) {
    clauses.push(
      "(display_name LIKE :q OR original_filename LIKE :q OR series_name LIKE :q OR description LIKE :q)"
    );
    args.q = `%${filters.q}%`;
  }
  if (filters.interior_pages) {
    clauses.push("interior_pages = :interior_pages");
    args.interior_pages = filters.interior_pages;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return rowsToPhotos(
    await execute(
      `SELECT * FROM photos ${where} ORDER BY imported_at DESC, id DESC`,
      args
    )
  );
}

export async function getPhoto(id: number): Promise<Photo | undefined> {
  if (!Number.isInteger(id)) return undefined;
  return rowsToPhotos(
    await execute("SELECT * FROM photos WHERE id = ?", [id])
  )[0];
}

export async function getPhotos(ids: number[]): Promise<Photo[]> {
  const validIds = ids.filter(Number.isInteger);
  if (validIds.length === 0) return [];
  const placeholders = validIds.map(() => "?").join(",");
  return rowsToPhotos(
    await execute(
      `SELECT * FROM photos WHERE id IN (${placeholders})`,
      validIds
    )
  );
}

export async function insertPhoto(input: {
  display_name: string;
  original_filename: string;
  file_ext: string;
  file_size: number;
  photo_url: string;
  thumbnail_url: string;
  width: number | null;
  height: number | null;
  original_created_at: string;
}): Promise<Photo> {
  const result = await execute(
    `INSERT INTO photos (display_name, original_filename, file_ext, file_size, photo_url, thumbnail_url, width, height, original_created_at)
     VALUES (:display_name, :original_filename, :file_ext, :file_size, :photo_url, :thumbnail_url, :width, :height, :original_created_at)
     RETURNING *`,
    input
  );
  return rowsToPhotos(result)[0];
}

export type PhotoUpdates = Partial<{
  display_name: string;
  series_name: string;
  series_release_date: string | null;
  colors: string[];
  description: string;
  photo_type: string;
  page_number: number | null;
  notebook_type: string;
  notebook_count: string;
  interior_pages: string;
  retail_price: number | null;
  wholesale_price: number | null;
  wholesale_minimum: number | null;
  cogs: number | null;
  inventory: number | null;
  inventory_check_date: string | null;
  raw_material: string;
}>;

const PHOTO_UPDATE_KEYS = [
  "display_name",
  "series_name",
  "series_release_date",
  "colors",
  "description",
  "photo_type",
  "page_number",
  "notebook_type",
  "notebook_count",
  "interior_pages",
  "retail_price",
  "wholesale_price",
  "wholesale_minimum",
  "cogs",
  "inventory",
  "inventory_check_date",
  "raw_material",
] as const satisfies readonly (keyof PhotoUpdates)[];

export async function updatePhoto(
  id: number,
  updates: PhotoUpdates
): Promise<Photo | undefined> {
  const args: Record<string, InValue> = { id };
  const fields: string[] = [];

  for (const key of PHOTO_UPDATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
    fields.push(`${key} = :${key}`);
    args[key] =
      key === "colors"
        ? JSON.stringify(updates.colors ?? [])
        : ((updates[key] ?? null) as InValue);
  }

  if (fields.length === 0) return getPhoto(id);

  await execute(
    `UPDATE photos SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = :id`,
    args
  );
  return getPhoto(id);
}

export async function bulkUpdateInteriorPages(
  ids: number[],
  interiorPages: string
): Promise<void> {
  const validIds = ids.filter(Number.isInteger);
  if (validIds.length === 0) return;
  const placeholders = validIds.map(() => "?").join(",");
  await execute(
    `UPDATE photos SET interior_pages = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`,
    [interiorPages, ...validIds]
  );
}

export async function deletePhoto(id: number): Promise<void> {
  await execute("DELETE FROM photos WHERE id = ?", [id]);
}
