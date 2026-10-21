import { NextResponse } from "next/server";

const BLOB_RELEASE_BASE = "https://pw5ksy69zcyunq3t.public.blob.vercel-storage.com/desktop/0.1.0";

const assets: Record<string, string> = {
  "linux-appimage": "Nexus.Office_0.1.0_amd64.AppImage",
  "linux-deb": "Nexus.Office_0.1.0_amd64.deb",
  "macos-arm64": "Nexus.Office_0.1.0_aarch64.dmg",
  "macos-x64": "Nexus.Office_0.1.0_x64.dmg",
  "windows-exe": "Nexus.Office_0.1.0_x64-setup.exe",
  "windows-msi": "Nexus.Office_0.1.0_x64_en-US.msi",
};

export async function GET(_request: Request, context: { params: Promise<{ target: string }> }) {
  const { target } = await context.params;
  const asset = assets[target];
  if (!asset) {
    return NextResponse.json({ error: "Unknown installer." }, { status: 404 });
  }

  const url = new URL(`${BLOB_RELEASE_BASE}/${encodeURIComponent(asset)}`);
  url.searchParams.set("download", asset);
  // Keep the site as the download entry point; the public file host serves only installer binaries.
  return NextResponse.redirect(url, { status: 302 });
}
