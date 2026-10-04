"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Photo } from "@/lib/types";
import {
  EMPTY_PRODUCT_FORM,
  ProductFieldsForm,
  productFormToPayload,
  toOptionalNumber,
  type ProductFormValues,
} from "@/components/ProductFieldsForm";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatImageDate(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function photoToForm(photo: Photo): ProductFormValues {
  return {
    displayName: photo.display_name,
    seriesName: photo.series_name ?? "",
    seriesReleaseDate: photo.series_release_date ?? "",
    colors: photo.colors ?? [],
    description: photo.description ?? "",
    photoType: photo.photo_type ?? "",
    pageNumber: photo.page_number ?? "",
    notebookType: photo.notebook_type ?? "",
    notebookCount: photo.notebook_count ?? "",
    interiorPages: photo.interior_pages ?? "",
    retailPrice: toOptionalNumber(photo.retail_price),
    wholesalePrice: toOptionalNumber(photo.wholesale_price),
    wholesaleMinimum: toOptionalNumber(photo.wholesale_minimum),
    cogs: toOptionalNumber(photo.cogs),
    inventory: toOptionalNumber(photo.inventory),
    inventoryCheckDate: photo.inventory_check_date ?? "",
    rawMaterial: photo.raw_material ?? "",
  };
}

export function PhotoDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<Photo | null | undefined>(undefined);
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function applyPhoto(next: Photo) {
    setPhoto(next);
    setValues(photoToForm(next));
  }

  useEffect(() => {
    fetch(`/api/photos/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve({ photo: null })))
      .then((data) => {
        if (data.photo) applyPhoto(data.photo);
        else setPhoto(null);
      });
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productFormToPayload(values)),
    });
    if (res.ok) {
      const data = await res.json();
      applyPhoto(data.photo);
      setSaved(true);
    }
    setSaving(false);
  }

  async function handleDownload() {
    if (!photo) return;
    const a = document.createElement("a");
    a.download = `${photo.display_name}.${photo.file_ext}`;
    try {
      const res = await fetch(photo.photo_url);
      if (!res.ok) throw new Error();
      a.href = URL.createObjectURL(await res.blob());
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      a.href = `${photo.photo_url}?download=1`;
      a.click();
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    await fetch(`/api/photos/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (photo === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-neutral-500">
        Loading...
      </div>
    );
  }

  if (photo === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-neutral-500">Photo not found.</p>
        <Link href="/" className="mt-2 inline-block text-sm underline">
          Back to gallery
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to gallery
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 md:self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.photo_url}
            alt={photo.display_name}
            className="h-full w-full object-contain"
          />
        </div>

        <div>
          <ProductFieldsForm values={values} onChange={setValues} />

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !values.displayName.trim()}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Download
            </button>
            <button
              onClick={handleDelete}
              className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>

          <dl className="mt-6 space-y-1 text-xs text-neutral-500">
            <div className="flex justify-between gap-4">
              <dt>Original image creation date</dt>
              <dd className="text-right">
                {formatImageDate(photo.original_created_at)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Creation date</dt>
              <dd>{new Date(photo.imported_at + "Z").toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Original filename</dt>
              <dd>{photo.original_filename}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Size</dt>
              <dd>{formatBytes(photo.file_size)}</dd>
            </div>
            {photo.width && photo.height && (
              <div className="flex justify-between">
                <dt>Dimensions</dt>
                <dd>
                  {photo.width} &times; {photo.height}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
