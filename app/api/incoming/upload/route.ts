import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { writeIncomingFile, extractZipToIncoming } from "@/lib/storage";

// Excluded from proxy.ts's matcher (see proxy.ts) so large uploads aren't
// capped by its in-memory body-buffering limit, so auth is checked here.
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload was too large or malformed." },
      { status: 400 }
    );
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const saved: string[] = [];
  let skipped = 0;

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        const result = await extractZipToIncoming(buffer);
        saved.push(...result.saved);
        skipped += result.skipped;
      } catch {
        return NextResponse.json(
          { error: `Could not read "${file.name}" as a zip file.` },
          { status: 400 }
        );
      }
    } else {
      saved.push(await writeIncomingFile(file.name, buffer));
    }
  }

  return NextResponse.json({ saved, skipped });
}
