import { NextRequest, NextResponse } from "next/server";
import { searchAlbums } from "@/lib/itunes";

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("term")?.trim();
  if (!term) {
    return NextResponse.json({ albums: [] });
  }

  try {
    const albums = await searchAlbums(term);
    return NextResponse.json({ albums });
  } catch {
    return NextResponse.json({ albums: [], error: "Search failed" }, { status: 502 });
  }
}
