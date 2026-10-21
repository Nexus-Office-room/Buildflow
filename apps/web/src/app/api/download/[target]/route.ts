import { NextResponse } from "next/server";

const RELEASE_API = "https://api.github.com/repos/lekanay2005-coder/Nexus-Office/releases/latest";

const assetMatchers: Record<string, (name: string) => boolean> = {
  "linux-appimage": (name) => name.endsWith(".AppImage") && name.includes("amd64"),
  "linux-deb": (name) => name.endsWith("_amd64.deb"),
  "macos-arm64": (name) => name.endsWith("_aarch64.dmg"),
  "macos-x64": (name) => name.endsWith("_x64.dmg"),
  "windows-exe": (name) => name.endsWith("_x64-setup.exe"),
  "windows-msi": (name) => name.endsWith("_x64_en-US.msi"),
};

type GitHubRelease = {
  assets?: Array<{ name?: string; browser_download_url?: string }>;
};

export async function GET(_request: Request, context: { params: Promise<{ target: string }> }) {
  const { target } = await context.params;
  const matchesAsset = assetMatchers[target];
  if (!matchesAsset) {
    return NextResponse.json({ error: "Unknown installer." }, { status: 404 });
  }

  let release: GitHubRelease;
  try {
    const response = await fetch(RELEASE_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Nexus-Office-Downloads" },
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`Release lookup returned ${response.status}`);
    release = (await response.json()) as GitHubRelease;
  } catch {
    return NextResponse.json({ error: "Installers are temporarily unavailable. Please try again shortly." }, { status: 503 });
  }

  const asset = release.assets?.find(
    (item) => typeof item.name === "string" && matchesAsset(item.name) && typeof item.browser_download_url === "string",
  );
  if (!asset?.browser_download_url || !asset.browser_download_url.startsWith("https://github.com/lekanay2005-coder/Nexus-Office/releases/download/")) {
    return NextResponse.json({ error: "This installer is not available in the latest release." }, { status: 404 });
  }

  // Send users straight to the selected installer file; never show the release page or source archives.
  return NextResponse.redirect(asset.browser_download_url, { status: 302 });
}
