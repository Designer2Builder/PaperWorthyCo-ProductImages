import { NextResponse } from "next/server";
import { listCategories } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ categories: listCategories() });
}
