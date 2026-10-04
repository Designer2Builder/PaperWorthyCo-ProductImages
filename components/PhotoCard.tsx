"use client";

import Link from "next/link";
import type { Photo } from "@/lib/types";

export function PhotoCard({
  photo,
  selected,
  onToggleSelect,
}: {
  photo: Photo;
  selected: boolean;
  onToggleSelect: (id: number) => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <label className="absolute left-2 top-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-white/90 shadow">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(photo.id)}
          className="h-4 w-4"
        />
      </label>
      <Link href={`/photos/${photo.id}`} className="block">
        <div className="aspect-square w-full overflow-hidden bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.thumbnail_url}
            alt={photo.display_name}
            className="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div className="p-2">
          <p className="truncate text-sm font-medium text-neutral-900">
            {photo.display_name}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {photo.series_name || photo.interior_pages}
          </p>
        </div>
      </Link>
    </div>
  );
}
