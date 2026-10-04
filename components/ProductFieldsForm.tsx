"use client";

import { useMemo, useState } from "react";
import {
  INTERIOR_PAGES,
  NOTEBOOK_COUNTS,
  NOTEBOOK_TYPES,
  PAGE_NUMBERS,
  PHOTO_TYPES,
  PRODUCT_COLORS,
} from "@/lib/productFields";

export const fieldClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";

export type ProductFormValues = {
  displayName: string;
  seriesName: string;
  seriesReleaseDate: string;
  colors: string[];
  description: string;
  photoType: string;
  pageNumber: number | "";
  notebookType: string;
  notebookCount: string;
  interiorPages: string;
  retailPrice: number | "";
  wholesalePrice: number | "";
  wholesaleMinimum: number | "";
  cogs: number | "";
  inventory: number | "";
  inventoryCheckDate: string;
  rawMaterial: string;
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  displayName: "",
  seriesName: "",
  seriesReleaseDate: "",
  colors: [],
  description: "",
  photoType: "",
  pageNumber: "",
  notebookType: "",
  notebookCount: "",
  interiorPages: "",
  retailPrice: "",
  wholesalePrice: "",
  wholesaleMinimum: "",
  cogs: "",
  inventory: "",
  inventoryCheckDate: "",
  rawMaterial: "",
};

export function toOptionalNumber(value: number | null | undefined): number | "" {
  return value == null ? "" : value;
}

function parseOptionalNumber(value: string): number | "" {
  if (value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

export function productFormToPayload(
  values: ProductFormValues,
  mode: "full" | "import" = "full"
) {
  const payload = {
    display_name: values.displayName,
    series_name: values.seriesName,
    series_release_date: values.seriesReleaseDate || null,
    colors: values.colors,
    description: values.description,
    photo_type: values.photoType,
    page_number: values.pageNumber === "" ? null : values.pageNumber,
    notebook_type: values.notebookType,
    notebook_count: values.notebookCount,
    interior_pages: values.interiorPages,
    retail_price: values.retailPrice === "" ? null : values.retailPrice,
    wholesale_price: values.wholesalePrice === "" ? null : values.wholesalePrice,
    wholesale_minimum:
      values.wholesaleMinimum === "" ? null : values.wholesaleMinimum,
    cogs: values.cogs === "" ? null : values.cogs,
    inventory: values.inventory === "" ? null : values.inventory,
    inventory_check_date: values.inventoryCheckDate || null,
    raw_material: values.rawMaterial,
  };

  if (mode !== "import") return payload;

  const omitted = new Set([
    "display_name",
    "colors",
    "photo_type",
    "notebook_count",
    "raw_material",
  ]);
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !omitted.has(key))
  );
}

function ColorMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [customColor, setCustomColor] = useState("");
  const options = useMemo(() => {
    const extras = value.filter(
      (color) => !(PRODUCT_COLORS as readonly string[]).includes(color)
    );
    return [...PRODUCT_COLORS, ...extras];
  }, [value]);

  function toggle(color: string) {
    onChange(
      value.includes(color)
        ? value.filter((item) => item !== color)
        : [...value, color]
    );
  }

  function addCustom() {
    const color = customColor.trim();
    if (!color) return;
    if (!value.includes(color)) onChange([...value, color]);
    setCustomColor("");
  }

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-2">
        {options.map((color) => {
          const selected = value.includes(color);
          return (
            <label
              key={color}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
                selected
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(color)}
                className="sr-only"
              />
              {color}
            </label>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add a color"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={addCustom}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: number | "";
  onChange: (next: number | "") => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
        $
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(parseOptionalNumber(e.target.value))}
        className={`${fieldClass} pl-7`}
      />
    </div>
  );
}

export function ProductFieldsForm({
  values,
  onChange,
  variant = "detail",
}: {
  values: ProductFormValues;
  onChange: (next: ProductFormValues) => void;
  variant?: "detail" | "import";
}) {
  function patch(partial: Partial<ProductFormValues>) {
    onChange({ ...values, ...partial });
  }

  const isImport = variant === "import";

  return (
    <div>
      {!isImport && (
        <>
          <label className="block text-sm font-medium text-neutral-700">
            Product Name
          </label>
          <input
            type="text"
            value={values.displayName}
            onChange={(e) => patch({ displayName: e.target.value })}
            className={fieldClass}
          />
        </>
      )}

      <label
        className={`${isImport ? "" : "mt-4"} block text-sm font-medium text-neutral-700`}
      >
        Series Name
      </label>
      <input
        type="text"
        value={values.seriesName}
        onChange={(e) => patch({ seriesName: e.target.value })}
        className={fieldClass}
      />

      <label className="mt-4 block text-sm font-medium text-neutral-700">
        Series Release Date
      </label>
      <input
        type="date"
        value={values.seriesReleaseDate}
        onChange={(e) => patch({ seriesReleaseDate: e.target.value })}
        className={fieldClass}
      />

      {!isImport && (
        <>
          <label className="mt-4 block text-sm font-medium text-neutral-700">
            Color
          </label>
          <ColorMultiSelect
            value={values.colors}
            onChange={(colors) => patch({ colors })}
          />
        </>
      )}

      <label className="mt-4 block text-sm font-medium text-neutral-700">
        Description
      </label>
      <textarea
        value={values.description}
        onChange={(e) => patch({ description: e.target.value })}
        rows={4}
        className={fieldClass}
      />

      {!isImport && (
        <>
          <label className="mt-4 block text-sm font-medium text-neutral-700">
            Photo Type
          </label>
          <select
            value={values.photoType}
            onChange={(e) => patch({ photoType: e.target.value })}
            className={fieldClass}
          >
            <option value="">Select...</option>
            {PHOTO_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </>
      )}

      {isImport ? (
        <>
          <label className="mt-4 block text-sm font-medium text-neutral-700">
            Page Number
          </label>
          <select
            value={values.pageNumber}
            onChange={(e) =>
              patch({
                pageNumber: e.target.value === "" ? "" : Number(e.target.value),
              })
            }
            className={fieldClass}
          >
            <option value="">Select...</option>
            {PAGE_NUMBERS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Page Number
            </label>
            <select
              value={values.pageNumber}
              onChange={(e) =>
                patch({
                  pageNumber:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className={fieldClass}
            >
              <option value="">Select...</option>
              {PAGE_NUMBERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Notebook Count
            </label>
            <select
              value={values.notebookCount}
              onChange={(e) => patch({ notebookCount: e.target.value })}
              className={fieldClass}
            >
              <option value="">Select...</option>
              {NOTEBOOK_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <label className="mt-4 block text-sm font-medium text-neutral-700">
        Notebook Type
      </label>
      <select
        value={values.notebookType}
        onChange={(e) => patch({ notebookType: e.target.value })}
        className={fieldClass}
      >
        <option value="">Select...</option>
        {NOTEBOOK_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <label className="mt-4 block text-sm font-medium text-neutral-700">
        Interior Pages
      </label>
      <select
        value={values.interiorPages}
        onChange={(e) => patch({ interiorPages: e.target.value })}
        className={fieldClass}
      >
        <option value="">Select...</option>
        {INTERIOR_PAGES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Retail Price
          </label>
          <MoneyInput
            value={values.retailPrice}
            onChange={(retailPrice) => patch({ retailPrice })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Wholesale Price
          </label>
          <MoneyInput
            value={values.wholesalePrice}
            onChange={(wholesalePrice) => patch({ wholesalePrice })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Wholesale Minimum
          </label>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={values.wholesaleMinimum}
            onChange={(e) => {
              const next = parseOptionalNumber(e.target.value);
              patch({
                wholesaleMinimum: next === "" ? "" : Math.trunc(next),
              });
            }}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            COGS
          </label>
          <MoneyInput
            value={values.cogs}
            onChange={(cogs) => patch({ cogs })}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Inventory
          </label>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={values.inventory}
            onChange={(e) => {
              const next = parseOptionalNumber(e.target.value);
              patch({ inventory: next === "" ? "" : Math.trunc(next) });
            }}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Inventory Check Date
          </label>
          <input
            type="date"
            value={values.inventoryCheckDate}
            onChange={(e) => patch({ inventoryCheckDate: e.target.value })}
            className={fieldClass}
          />
        </div>
      </div>

      {!isImport && (
        <>
          <label className="mt-4 block text-sm font-medium text-neutral-700">
            Raw Material
          </label>
          <input
            type="text"
            value={values.rawMaterial}
            onChange={(e) => patch({ rawMaterial: e.target.value })}
            className={fieldClass}
          />
        </>
      )}
    </div>
  );
}
