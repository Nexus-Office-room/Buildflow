import { NextResponse } from "next/server";

const RELEASE_BASE = "https://github.com/Nexus-Office-room/Nexus-Office-Downloads/releases/latest/download";

const archives: Record<string, string> = {
  linux: "Nexus-Office-Linux.zip",
  "macos-arm64": "Nexus-Office-macOS-Apple-Silicon.zip",
  "macos-x64": "Nexus-Office-macOS-Intel.zip",
  windows: "Nexus-Office-Windows.zip",
};

export async function GET(_request: Request, context: { params: Promise<{ target: string }> }) {
  const { target } = await context.params;
  const archive = archives[target];
  if (!archive) {
    return NextResponse.json({ error: "Unknown download." }, { status: 404 });
  }

  // Proxy the public installer asset so download clicks remain on the Buildflow domain.
  const url = `${RELEASE_BASE}/${encodeURIComponent(archive)}`;
  const upstream = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "This download is temporarily unavailable." }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archive}"`,
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
