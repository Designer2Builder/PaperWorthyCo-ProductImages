"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Photo } from "@/lib/types";
import { INTERIOR_PAGES } from "@/lib/productFields";
import { PhotoCard } from "@/components/PhotoCard";
import { BulkActionBar } from "@/components/BulkActionBar";

export function GalleryClient() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [search, setSearch] = useState("");
  const [interiorPagesFilter, setInteriorPagesFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (interiorPagesFilter) params.set("interior_pages", interiorPagesFilter);
    const res = await fetch(`/api/photos?${params.toString()}`);
    const data = await res.json();
    setPhotos(data.photos ?? []);
    setLoading(false);
  }, [search, interiorPagesFilter]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (interiorPagesFilter) params.set("interior_pages", interiorPagesFilter);
      const res = await fetch(`/api/photos?${params.toString()}`);
      const data = await res.json();
      if (!cancelled) {
        setPhotos(data.photos ?? []);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, interiorPagesFilter]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDownload() {
    const res = await fetch("/api/photos/bulk-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      alert(data.error || "Could not prepare the download.");
      return;
    }
    window.location.href = data.url;
  }

  async function handleSetInteriorPages(interiorPages: string) {
    await fetch("/api/photos/bulk-categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: Array.from(selected),
        interior_pages: interiorPages,
      }),
    });
    setSelected(new Set());
    await loadPhotos();
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete ${selected.size} photo${selected.size === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/photos/${id}`, { method: "DELETE" })
      )
    );
    setSelected(new Set());
    await loadPhotos();
  }

  const hasSelection = selected.size > 0;
  const allSelected =
    photos.length > 0 && photos.every((photo) => selected.has(photo.id));

  function handleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(photos.map((photo) => photo.id)));
  }

  const emptyMessage = useMemo(() => {
    if (loading) return null;
    if (photos.length > 0) return null;
    if (search || interiorPagesFilter) return "No photos match your filters.";
    return "No photos yet. Head to Import to add some.";
  }, [loading, photos.length, search, interiorPagesFilter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or series..."
          className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={interiorPagesFilter}
          onChange={(e) => setInteriorPagesFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">All interior pages</option>
          {INTERIOR_PAGES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="text-sm text-neutral-500">
          {photos.length} photo{photos.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={handleSelectAll}
          disabled={photos.length === 0}
          className="text-sm font-medium text-neutral-700 underline disabled:text-neutral-400 disabled:no-underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      {hasSelection && (
        <div className="mb-4">
          <BulkActionBar
            count={selected.size}
            onDownload={handleDownload}
            onSetInteriorPages={handleSetInteriorPages}
            onDelete={handleDelete}
            onClearSelection={() => setSelected(new Set())}
          />
        </div>
      )}

      {emptyMessage && (
        <p className="mt-12 text-center text-sm text-neutral-500">
          {emptyMessage}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            selected={selected.has(photo.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </div>
  );
}
