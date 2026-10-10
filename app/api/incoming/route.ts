import { NextRequest, NextResponse } from "next/server";
import {
  listIncomingFiles,
  removeIncomingFile,
  clearIncomingFiles,
} from "@/lib/storage";

export async function GET() {
  try {
    const files = await listIncomingFiles();
    return NextResponse.json({ files });
  } catch (err) {
    console.error("Listing staged files failed:", err);
    return NextResponse.json(
      { error: `Could not load staged files: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname");
  if (pathname) {
    await removeIncomingFile(pathname);
  } else {
    await clearIncomingFiles();
  }
  return NextResponse.json({ ok: true });
}
