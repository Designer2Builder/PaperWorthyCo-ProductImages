import "server-only";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "@/lib/storage";
import { parseColors } from "@/lib/productFields";
import type { Photo } from "@/lib/types";

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Uncategorized',
    file_ext TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
`);

function ensureColumn(name: string, definition: string) {
  const columns = db.pragma("table_info(photos)") as { name: string }[];
  if (!columns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE photos ADD COLUMN ${name} ${definition}`);
  }
}

ensureColumn("series_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("series_release_date", "TEXT");
ensureColumn("colors", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("description", "TEXT NOT NULL DEFAULT ''");
ensureColumn("page_number", "INTEGER");
ensureColumn("notebook_type", "TEXT NOT NULL DEFAULT ''");
ensureColumn("notebook_count", "TEXT NOT NULL DEFAULT ''");
ensureColumn("original_created_at", "TEXT");
ensureColumn("interior_pages", "TEXT NOT NULL DEFAULT ''");
ensureColumn("retail_price", "REAL");
ensureColumn("wholesale_price", "REAL");
ensureColumn("wholesale_minimum", "INTEGER");
ensureColumn("cogs", "REAL");
ensureColumn("photo_type", "TEXT NOT NULL DEFAULT ''");
ensureColumn("inventory", "INTEGER");
ensureColumn("inventory_check_date", "TEXT");
ensureColumn("raw_material", "TEXT NOT NULL DEFAULT ''");

db.prepare(
  "UPDATE photos SET notebook_count = 'Pair' WHERE notebook_count = 'Duo'"
).run();

interface PhotoRow extends Omit<Photo, "colors"> {
  colors: string;
}

function mapPhoto(row: PhotoRow | undefined): Photo | undefined {
  if (!row) return undefined;
  return {
    ...row,
    colors: parseColors(row.colors),
  };
}

function mapPhotos(rows: PhotoRow[]): Photo[] {
  return rows.map((row) => mapPhoto(row)!);
}

export interface PhotoFilters {
  q?: string;
  interior_pages?: string;
}

export function listPhotos(filters: PhotoFilters = {}): Photo[] {
  const clauses: string[] = [];
  const params: Record<string, string> = {};

  if (filters.q) {
    clauses.push(
      "(display_name LIKE @q OR original_filename LIKE @q OR series_name LIKE @q OR description LIKE @q)"
    );
    params.q = `%${filters.q}%`;
  }
  if (filters.interior_pages) {
    clauses.push("interior_pages = @interior_pages");
    params.interior_pages = filters.interior_pages;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return mapPhotos(
    db
      .prepare(`SELECT * FROM photos ${where} ORDER BY imported_at DESC`)
      .all(params) as PhotoRow[]
  );
}

export function getPhoto(id: number): Photo | undefined {
  return mapPhoto(
    db.prepare("SELECT * FROM photos WHERE id = ?").get(id) as
      | PhotoRow
      | undefined
  );
}

export function getPhotos(ids: number[]): Photo[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return mapPhotos(
    db
      .prepare(`SELECT * FROM photos WHERE id IN (${placeholders})`)
      .all(...ids) as PhotoRow[]
  );
}

export function insertPhoto(input: {
  display_name: string;
  original_filename: string;
  category: string;
  file_ext: string;
  file_size: number;
  width: number | null;
  height: number | null;
}): Photo {
  const result = db
    .prepare(
      `INSERT INTO photos (display_name, original_filename, category, file_ext, file_size, width, height)
       VALUES (@display_name, @original_filename, @category, @file_ext, @file_size, @width, @height)`
    )
    .run(input);
  return getPhoto(Number(result.lastInsertRowid))!;
}

export type PhotoUpdates = Partial<{
  display_name: string;
  category: string;
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
  "category",
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

export function updatePhoto(id: number, updates: PhotoUpdates): Photo | undefined {
  const payload: Record<string, unknown> = { id };
  const fields: string[] = [];

  for (const key of PHOTO_UPDATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
    fields.push(`${key} = @${key}`);
    payload[key] =
      key === "colors" ? JSON.stringify(updates.colors ?? []) : updates[key];
  }

  if (fields.length === 0) return getPhoto(id);

  db.prepare(
    `UPDATE photos SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = @id`
  ).run(payload);
  return getPhoto(id);
}

export function updatePhotoDimensions(
  id: number,
  width: number | null,
  height: number | null
): void {
  db.prepare("UPDATE photos SET width = ?, height = ? WHERE id = ?").run(
    width,
    height,
    id
  );
}

export function updatePhotoOriginalCreatedAt(
  id: number,
  originalCreatedAt: string
): void {
  db.prepare("UPDATE photos SET original_created_at = ? WHERE id = ?").run(
    originalCreatedAt,
    id
  );
}

export function listPhotosNeedingOriginalCreatedAt(): Photo[] {
  return mapPhotos(
    db
      .prepare(
        "SELECT * FROM photos WHERE original_created_at IS NULL ORDER BY id"
      )
      .all() as PhotoRow[]
  );
}

export function bulkUpdateInteriorPages(
  ids: number[],
  interiorPages: string
): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE photos SET interior_pages = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
  ).run(interiorPages, ...ids);
}

export function deletePhoto(id: number): void {
  db.prepare("DELETE FROM photos WHERE id = ?").run(id);
}

export function listCategories(): string[] {
  const rows = db
    .prepare(
      "SELECT DISTINCT category FROM photos ORDER BY category COLLATE NOCASE"
    )
    .all() as { category: string }[];
  return rows.map((r) => r.category);
}

export default db;
