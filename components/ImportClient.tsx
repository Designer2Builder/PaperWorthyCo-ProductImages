"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import type { IncomingFile } from "@/lib/types";
import {
  EMPTY_PRODUCT_FORM,
  ProductFieldsForm,
  productFormToPayload,
  type ProductFormValues,
} from "@/components/ProductFieldsForm";

const UPLOAD_CONCURRENCY = 3;
const IMAGE_FILE = /\.(jpe?g|png|gif|webp)$/i;

function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_") || "photo";
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
}

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
    percent: number;
  } | null>(null);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: { name: string; error: string }[];
  } | null>(null);
  const [uploadSkipped, setUploadSkipped] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [productValues, setProductValues] =
    useState<ProductFormValues>(EMPTY_PRODUCT_FORM);

  const [listError, setListError] = useState<string | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const fetchFiles = useCallback(async (): Promise<
    { files: IncomingFile[] } | { error: string }
  > => {
    try {
      const res = await fetch("/api/incoming");
      if (res.redirected && new URL(res.url).pathname === "/login") {
        return { error: "Your session expired. Reload the page and log in again." };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.files)) {
        return {
          error: data.error || `Could not load staged files (status ${res.status}).`,
        };
      }
      return { files: data.files };
    } catch {
      return { error: "Could not load staged files. Check your connection." };
    }
  }, []);

  const loadFiles = useCallback(async () => {
    const result = await fetchFiles();
    if ("error" in result) {
      setListError(result.error);
    } else {
      setListError(null);
      setFiles(result.files);
    }
  }, [fetchFiles]);

  useEffect(() => {
    let cancelled = false;
    fetchFiles().then((result) => {
      if (cancelled) return;
      if ("error" in result) setListError(result.error);
      else setFiles(result.files);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchFiles]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const selectedFiles = Array.from(fileList);
    const images = selectedFiles.filter((f) => IMAGE_FILE.test(f.name));
    setImportResult(null);
    setUploadSkipped(selectedFiles.length - images.length);
    setUploadError(null);
    setUploadedCount(0);

    if (images.length === 0) {
      setUploadError(
        "None of the selected files are JPG, PNG, GIF, or WebP images, so nothing was uploaded. iPhone HEIC photos need to be exported as JPG first."
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    let done = 0;
    const failures: string[] = [];
    const totalBytes = images.reduce((sum, f) => sum + f.size, 0);
    const loadedBytes = new Map<File, number>();
    const report = () =>
      setUploadProgress({
        done,
        total: images.length,
        percent: Math.round(
          (Array.from(loadedBytes.values()).reduce((a, b) => a + b, 0) /
            Math.max(totalBytes, 1)) *
            100
        ),
      });
    report();

    await runWithConcurrency(images, UPLOAD_CONCURRENCY, async (file) => {
      try {
        await upload(
          `incoming/${crypto.randomUUID()}/${safeFilename(file.name)}`,
          file,
          {
            access: "public",
            handleUploadUrl: "/api/incoming/upload",
            multipart: file.size > 5 * 1024 * 1024,
            onUploadProgress: ({ loaded }) => {
              loadedBytes.set(file, loaded);
              report();
            },
          }
        );
        loadedBytes.set(file, file.size);
      } catch (err) {
        const error = err as Error;
        failures.push(`${file.name}: ${error.name}: ${error.message}`);
      }
      done += 1;
      report();
    });

    if (failures.length > 0) {
      setUploadError(
        `${failures.length} file${failures.length === 1 ? "" : "s"} failed to upload. ${failures.join("; ")}`
      );
    }
    setUploadedCount(images.length - failures.length);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadFiles();
  }

  async function handleRemove(pathname: string) {
    await fetch(`/api/incoming?pathname=${encodeURIComponent(pathname)}`, {
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
    const toImport = files;
    const fields = productFormToPayload(productValues, "import");
    let imported = 0;
    const failed: { name: string; error: string }[] = [];
    setImportResult(null);
    setImportProgress({ done: 0, total: toImport.length });

    for (const [i, file] of toImport.entries()) {
      try {
        const res = await fetch("/api/incoming/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fields, pathname: file.pathname }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) imported += 1;
        else
          failed.push({
            name: file.name,
            error: data.error || `status ${res.status}`,
          });
      } catch {
        failed.push({ name: file.name, error: "Network error" });
      }
      setImportProgress({ done: i + 1, total: toImport.length });
    }

    setImportResult({ imported, failed });
    setImportProgress(null);
    if (imported > 0) setProductValues(EMPTY_PRODUCT_FORM);
    await loadFiles();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-semibold text-neutral-900">
        Bulk import photos
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Select photos (JPG, PNG, GIF, or WebP), review what&apos;s staged
        below, then import them all into the catalog. For a Google Drive
        export, unzip it on your computer first and select the image files
        inside.
      </p>

      <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="text-sm"
        />
        {uploadProgress && (
          <p className="mt-2 text-sm text-neutral-500">
            Uploading {uploadProgress.done} / {uploadProgress.total} (
            {uploadProgress.percent}%)...
          </p>
        )}
        {!uploadProgress && uploadedCount > 0 && (
          <p className="mt-2 text-sm text-green-600">
            Uploaded {uploadedCount} photo{uploadedCount === 1 ? "" : "s"}.
          </p>
        )}
        {!uploadProgress && uploadSkipped > 0 && (
          <p className="mt-2 text-sm text-neutral-500">
            Skipped {uploadSkipped} non-image file
            {uploadSkipped === 1 ? "" : "s"}.
          </p>
        )}
        {uploadError && (
          <p className="mt-2 text-sm text-red-600">{uploadError}</p>
        )}
        {listError && (
          <p className="mt-2 text-sm text-red-600">{listError}</p>
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
              key={file.pathname}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="truncate text-neutral-800">{file.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-neutral-400">
                  {formatBytes(file.size)}
                </span>
                <button
                  onClick={() => handleRemove(file.pathname)}
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
            disabled={importProgress !== null}
            className="mt-4 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {importProgress
              ? `Importing ${importProgress.done} / ${importProgress.total}...`
              : `Import ${files.length} photo${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
