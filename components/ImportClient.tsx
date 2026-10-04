"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IncomingFile } from "@/lib/types";
import {
  EMPTY_PRODUCT_FORM,
  ProductFieldsForm,
  productFormToPayload,
  type ProductFormValues,
} from "@/components/ProductFieldsForm";

const BATCH_SIZE = 10;
const MAX_ZIP_SIZE = 250 * 1024 * 1024; // 250MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<IncomingFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: { name: string; error: string }[];
  } | null>(null);
  const [uploadSkipped, setUploadSkipped] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [productValues, setProductValues] =
    useState<ProductFormValues>(EMPTY_PRODUCT_FORM);

  const loadFiles = useCallback(async () => {
    const res = await fetch("/api/incoming");
    const data = await res.json();
    setFiles(data.files ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/incoming");
      const data = await res.json();
      if (!cancelled) setFiles(data.files ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const allFiles = Array.from(fileList);
    setImportResult(null);
    setUploadSkipped(0);
    setUploadError(null);

    const oversizedZip = allFiles.find(
      (f) => f.name.toLowerCase().endsWith(".zip") && f.size > MAX_ZIP_SIZE
    );
    if (oversizedZip) {
      setUploadError(
        `"${oversizedZip.name}" is ${formatBytes(oversizedZip.size)} — too large to upload as a zip. ` +
          "Unzip it on your computer first, then select the image files directly (they upload in small batches)."
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadProgress({ done: 0, total: allFiles.length });

    let skipped = 0;
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      const formData = new FormData();
      batch.forEach((file) => formData.append("files", file));

      try {
        const res = await fetch("/api/incoming/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setUploadError(
            data.error || `Upload failed (status ${res.status}).`
          );
          break;
        }
        skipped += data.skipped ?? 0;
      } catch {
        setUploadError("Upload failed. Check your connection and try again.");
        break;
      }

      setUploadProgress({
        done: Math.min(i + BATCH_SIZE, allFiles.length),
        total: allFiles.length,
      });
    }

    setUploadSkipped(skipped);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadFiles();
  }

  async function handleRemove(name: string) {
    await fetch(`/api/incoming?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    await loadFiles();
  }

  async function handleClearAll() {
    if (!confirm("Remove all staged files? They will not be imported.")) {
      return;
    }
    await fetch("/api/incoming", { method: "DELETE" });
    await loadFiles();
  }

  async function handleImportAll() {
    setImporting(true);
    setImportResult(null);
    const res = await fetch("/api/incoming/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productFormToPayload(productValues, "import")),
    });
    const data = await res.json();
    setImportResult(data);
    setImporting(false);
    if (data.imported > 0) setProductValues(EMPTY_PRODUCT_FORM);
    await loadFiles();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-semibold text-neutral-900">
        Bulk import photos
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Select photos exported from Google Drive (individual images, or a
        .zip of a folder under ~250MB), review what&apos;s staged below, then
        import them all into the catalog. For a bigger export, unzip it on
        your computer first and select the image files directly &mdash;
        those upload in small batches, so there&apos;s no size limit.
      </p>

      <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.zip,application/zip"
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="text-sm"
        />
        {uploadProgress && (
          <p className="mt-2 text-sm text-neutral-500">
            Uploading {uploadProgress.done} / {uploadProgress.total}...
          </p>
        )}
        {!uploadProgress && uploadSkipped > 0 && (
          <p className="mt-2 text-sm text-neutral-500">
            Skipped {uploadSkipped} non-image file
            {uploadSkipped === 1 ? "" : "s"} found in the zip.
          </p>
        )}
        {uploadError && (
          <p className="mt-2 text-sm text-red-600">{uploadError}</p>
        )}
      </div>

      {importResult && (
        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-3 text-sm">
          <p className="font-medium text-neutral-900">
            Imported {importResult.imported} photo
            {importResult.imported === 1 ? "" : "s"}.
          </p>
          {importResult.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-600">
              {importResult.failed.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
          {importResult.imported > 0 && (
            <button
              onClick={() => router.push("/")}
              className="mt-2 text-sm text-neutral-700 underline"
            >
              View in gallery
            </button>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-900">
          Staged files ({files.length})
        </h2>
        {files.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-sm text-neutral-500 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {files.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing staged yet. Select files above to get started.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="truncate text-neutral-800">{file.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-neutral-400">
                  {formatBytes(file.size)}
                </span>
                <button
                  onClick={() => handleRemove(file.name)}
                  className="text-neutral-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-medium text-neutral-900">
            Apply to all imported photos
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Fill in any fields below and they will be saved on every photo in
            this import. Each file keeps its own name.
          </p>
          <div className="mt-4">
            <ProductFieldsForm
              values={productValues}
              onChange={setProductValues}
              variant="import"
            />
          </div>
          <button
            onClick={handleImportAll}
            disabled={importing}
            className="mt-4 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {importing
              ? "Importing..."
              : `Import ${files.length} photo${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
