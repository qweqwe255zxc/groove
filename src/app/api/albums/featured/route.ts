import { NextResponse } from "next/server";
import { getFeaturedAlbums } from "@/lib/itunes";

export async function GET() {
  try {
    const albums = await getFeaturedAlbums();
    return NextResponse.json({ albums });
  } catch {
    return NextResponse.json(
      { albums: [], error: "Failed to load featured albums" },
      { status: 502 }
    );
  }
}
