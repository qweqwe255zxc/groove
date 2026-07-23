import { NextRequest, NextResponse } from "next/server";
import { getAlbumTracks } from "@/lib/itunes";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  const { collectionId } = await params;
  const id = Number(collectionId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ tracks: [] }, { status: 400 });
  }

  try {
    const tracks = await getAlbumTracks(id);
    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ tracks: [], error: "Lookup failed" }, { status: 502 });
  }
}
