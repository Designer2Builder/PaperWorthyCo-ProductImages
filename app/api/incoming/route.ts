import { NextRequest, NextResponse } from "next/server";
import {
  listIncomingFiles,
  removeIncomingFile,
  clearIncomingFiles,
} from "@/lib/storage";

export async function GET() {
  const files = await listIncomingFiles();
  return NextResponse.json({ files });
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
