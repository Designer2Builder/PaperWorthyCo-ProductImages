import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof password !== "string" || !checkPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
