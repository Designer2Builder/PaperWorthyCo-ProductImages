import "server-only";
import {
  getPhoto,
  listPhotosNeedingOriginalCreatedAt,
  updatePhotoOriginalCreatedAt,
} from "@/lib/db";
import { getImageMetadata, photoFilePath } from "@/lib/storage";
import type { Photo } from "@/lib/types";

export async function ensureOriginalCreatedAt(photo: Photo): Promise<Photo> {
  if (photo.original_created_at !== null) return photo;

  const { originalCreatedAt } = await getImageMetadata(
    photoFilePath(photo.id, photo.file_ext)
  );
  updatePhotoOriginalCreatedAt(photo.id, originalCreatedAt ?? "");
  return getPhoto(photo.id)!;
}

let backfillStarted = false;

export function startOriginalCreatedAtBackfill(): void {
  if (backfillStarted) return;
  backfillStarted = true;
  void (async () => {
    const photos = listPhotosNeedingOriginalCreatedAt();
    for (const photo of photos) {
      await ensureOriginalCreatedAt(photo);
    }
  })();
}
