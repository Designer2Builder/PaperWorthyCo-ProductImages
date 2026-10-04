"use client";

import { useState } from "react";
import { INTERIOR_PAGES } from "@/lib/productFields";

export function BulkActionBar({
  count,
  onDownload,
  onSetInteriorPages,
  onDelete,
  onClearSelection,
}: {
  count: number;
  onDownload: () => void;
  onSetInteriorPages: (interiorPages: string) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}) {
  const [interiorPages, setInteriorPages] = useState("");

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-3 shadow-md">
      <span className="text-sm font-medium text-neutral-900">
        {count} selected
      </span>
      <button
        onClick={onDownload}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
      >
        Download ZIP
      </button>
      <div className="flex items-center gap-1.5">
        <select
          value={interiorPages}
          onChange={(e) => setInteriorPages(e.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="">Interior Pages</option>
          {INTERIOR_PAGES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          onClick={() => interiorPages && onSetInteriorPages(interiorPages)}
          disabled={!interiorPages}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      <button
        onClick={onDelete}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
      <button
        onClick={onClearSelection}
        className="ml-auto text-sm text-neutral-500 hover:underline"
      >
        Clear selection
      </button>
    </div>
  );
}
