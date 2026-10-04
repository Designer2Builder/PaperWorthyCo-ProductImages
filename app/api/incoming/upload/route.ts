import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  isIncomingPathname,
} from "@/lib/storage";

// Issues short-lived tokens so the browser can upload photos straight to
// Vercel Blob, since Vercel caps function request bodies at 4.5MB.
export async function POST(request: NextRequest) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isIncomingPathname(pathname)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: IMAGE_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Upload token request failed:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
