import { NextResponse } from "next/server";

const RELEASE_BASE = "https://github.com/Nexus-Office-room/Buildflow-Downloads/releases/latest/download";

const archives: Record<string, string> = {
  linux: "Buildflow-Linux.zip",
  "macos-arm64": "Buildflow-macOS-Apple-Silicon.zip",
  "macos-x64": "Buildflow-macOS-Intel.zip",
  windows: "Buildflow-Windows.zip",
};

// Keep already-published 0.1.1 archives downloadable until the first Buildflow
// desktop release has replaced them in the public downloads repository.
const legacyArchives: Record<string, string> = {
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
  let upstream = await fetch(`${RELEASE_BASE}/${encodeURIComponent(archive)}`, {
    cache: "no-store",
    redirect: "follow",
  });
  if (!upstream.ok && legacyArchives[target]) {
    upstream = await fetch(
      `${RELEASE_BASE}/${encodeURIComponent(legacyArchives[target])}`,
      { cache: "no-store", redirect: "follow" }
    );
  }
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
