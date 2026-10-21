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

  // The public downloads repository contains installers only; application source stays private.
  const url = `${RELEASE_BASE}/${encodeURIComponent(archive)}`;
  return NextResponse.redirect(url, { status: 302 });
}
