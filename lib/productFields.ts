export const NOTEBOOK_TYPES = [
  "Hardcover",
  "Softcover Wrap",
  "Softcover Envelope",
  "Travelers",
  "Saddle Stitch",
] as const;

export const NOTEBOOK_COUNTS = ["Individual", "Pair", "Trio", "Quad"] as const;

export const INTERIOR_PAGES = ["Blank", "Lined", "Dotted"] as const;

export const PHOTO_TYPES = ["Product", "Lifestyle", "Other"] as const;

export const PRODUCT_COLORS = [
  "Black",
  "White",
  "Ivory",
  "Cream",
  "Kraft",
  "Gray",
  "Charcoal",
  "Navy",
  "Blue",
  "Teal",
  "Green",
  "Sage",
  "Olive",
  "Yellow",
  "Gold",
  "Orange",
  "Red",
  "Burgundy",
  "Pink",
  "Blush",
  "Purple",
  "Lavender",
  "Brown",
  "Tan",
] as const;

export const PAGE_NUMBERS = Array.from({ length: 251 }, (_, i) => i);

export type NotebookType = (typeof NOTEBOOK_TYPES)[number];
export type NotebookCount = (typeof NOTEBOOK_COUNTS)[number];
export type InteriorPages = (typeof INTERIOR_PAGES)[number];
export type PhotoType = (typeof PHOTO_TYPES)[number];

export function isNotebookType(value: string): value is NotebookType {
  return (NOTEBOOK_TYPES as readonly string[]).includes(value);
}

export function isNotebookCount(value: string): value is NotebookCount {
  return (NOTEBOOK_COUNTS as readonly string[]).includes(value);
}

export function isInteriorPages(value: string): value is InteriorPages {
  return (INTERIOR_PAGES as readonly string[]).includes(value);
}

export function isPhotoType(value: string): value is PhotoType {
  return (PHOTO_TYPES as readonly string[]).includes(value);
}

export function isPageNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 250;
}

export function isMoney(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isWholesaleMinimum(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}

export function isInventory(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}

export function parseColors(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
