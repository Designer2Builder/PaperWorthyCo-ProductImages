import type { PhotoUpdates } from "@/lib/db";
import {
  isInteriorPages,
  isInventory,
  isMoney,
  isNotebookCount,
  isNotebookType,
  isPageNumber,
  isPhotoType,
  isWholesaleMinimum,
  roundMoney,
} from "@/lib/productFields";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseProductUpdates(body: Record<string, unknown>): PhotoUpdates {
  const updates: PhotoUpdates = {};

  if (typeof body.display_name === "string" && body.display_name.trim()) {
    updates.display_name = body.display_name.trim();
  }
  if (typeof body.series_name === "string") {
    updates.series_name = body.series_name.trim();
  }
  if (body.series_release_date === null || body.series_release_date === "") {
    updates.series_release_date = null;
  } else if (
    typeof body.series_release_date === "string" &&
    DATE_PATTERN.test(body.series_release_date)
  ) {
    updates.series_release_date = body.series_release_date;
  }
  if (Array.isArray(body.colors)) {
    updates.colors = [
      ...new Set(
        body.colors
          .filter(
            (color): color is string =>
              typeof color === "string" && color.trim().length > 0
          )
          .map((color) => color.trim())
      ),
    ];
  }
  if (typeof body.description === "string") {
    updates.description = body.description;
  }
  if (typeof body.photo_type === "string") {
    const value = body.photo_type.trim();
    if (value === "" || isPhotoType(value)) {
      updates.photo_type = value;
    }
  }
  if (body.page_number === null || body.page_number === "") {
    updates.page_number = null;
  } else if (typeof body.page_number === "number" && isPageNumber(body.page_number)) {
    updates.page_number = body.page_number;
  }
  if (typeof body.notebook_type === "string") {
    const value = body.notebook_type.trim();
    if (value === "" || isNotebookType(value)) {
      updates.notebook_type = value;
    }
  }
  if (typeof body.notebook_count === "string") {
    const value = body.notebook_count.trim();
    if (value === "" || isNotebookCount(value)) {
      updates.notebook_count = value;
    }
  }
  if (typeof body.interior_pages === "string") {
    const value = body.interior_pages.trim();
    if (value === "" || isInteriorPages(value)) {
      updates.interior_pages = value;
    }
  }
  if (body.retail_price === null || body.retail_price === "") {
    updates.retail_price = null;
  } else if (typeof body.retail_price === "number" && isMoney(body.retail_price)) {
    updates.retail_price = roundMoney(body.retail_price);
  }
  if (body.wholesale_price === null || body.wholesale_price === "") {
    updates.wholesale_price = null;
  } else if (
    typeof body.wholesale_price === "number" &&
    isMoney(body.wholesale_price)
  ) {
    updates.wholesale_price = roundMoney(body.wholesale_price);
  }
  if (body.wholesale_minimum === null || body.wholesale_minimum === "") {
    updates.wholesale_minimum = null;
  } else if (
    typeof body.wholesale_minimum === "number" &&
    isWholesaleMinimum(body.wholesale_minimum)
  ) {
    updates.wholesale_minimum = body.wholesale_minimum;
  }
  if (body.cogs === null || body.cogs === "") {
    updates.cogs = null;
  } else if (typeof body.cogs === "number" && isMoney(body.cogs)) {
    updates.cogs = roundMoney(body.cogs);
  }
  if (body.inventory === null || body.inventory === "") {
    updates.inventory = null;
  } else if (typeof body.inventory === "number" && isInventory(body.inventory)) {
    updates.inventory = body.inventory;
  }
  if (body.inventory_check_date === null || body.inventory_check_date === "") {
    updates.inventory_check_date = null;
  } else if (
    typeof body.inventory_check_date === "string" &&
    DATE_PATTERN.test(body.inventory_check_date)
  ) {
    updates.inventory_check_date = body.inventory_check_date;
  }
  if (typeof body.raw_material === "string") {
    updates.raw_material = body.raw_material.trim();
  }

  return updates;
}
