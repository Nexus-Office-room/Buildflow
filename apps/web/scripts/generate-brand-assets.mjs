// Generates public/brand/*.png from the Buildflow vector mark + public/background.png.
// Placeholder art is synthesized if the source assets don't exist yet, so this
// runs on a fresh clone; drop in real assets and re-run: `npm run assets`.
// Dev-only tooling — never runs inside `next build`. sharp is already in the
// dependency tree (Next 16 requires it for image optimization).

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PUBLIC = path.resolve("public");
const BRAND = path.join(PUBLIC, "brand");
fs.mkdirSync(BRAND, { recursive: true });

// ---------------------------------------------------------------------------
// Placeholder background art (only used when public/background.png is missing).

const BG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B0D12"/><stop offset="1" stop-color="#10131c"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <g fill="#3b82f6" opacity="0.16">
    ${Array.from({ length: 48 }, (_, i) => {
      const x = 20 + (i * 397) % 1880;
      const h = 40 + ((i * 131) % 200);
      const y = (i * 733) % 880;
      return `<rect x="${x}" y="${y}" width="2.5" height="${h}"/>`;
    }).join("")}
  </g>
  <g fill="#ef4444" opacity="0.10">
    ${Array.from({ length: 36 }, (_, i) => {
      const x = 40 + (i * 503) % 1840;
      const h = 30 + ((i * 97) % 160);
      const y = (i * 419) % 900;
      return `<rect x="${x}" y="${y}" width="2" height="${h}"/>`;
    }).join("")}
  </g>
  <rect x="0" y="0" width="1920" height="6" fill="url(#acc)" opacity="0.55"/>
  <rect x="0" y="1074" width="1920" height="6" fill="url(#acc)" opacity="0.35"/>
</svg>`;

// ---------------------------------------------------------------------------
// Icon size derivation
// ---------------------------------------------------------------------------

const ICON_SIZES = [16, 32, 180, 192, 512];

async function main() {
  console.log("Buildflow brand assets:");

  const logoPath = path.join(PUBLIC, "brand", "buildflow-mark.svg");
  if (!fs.existsSync(logoPath)) throw new Error("Missing public/brand/buildflow-mark.svg");
  // Keep legacy logo and favicon URLs aligned with the current product mark.
  await sharp(logoPath).resize(512, 512).png().toFile(path.join(PUBLIC, "logo.png"));
  await sharp(logoPath).resize(32, 32).png().toFile(path.join(PUBLIC, "favicon.png"));

  // background.png is standalone — generate at 1920x1080 if missing.
  const bgPath = path.join(PUBLIC, "background.png");
  if (!fs.existsSync(bgPath)) {
    await sharp(Buffer.from(BG_SVG), { density: 96 }).resize(1920, 1080).png().toFile(bgPath);
    console.log("  + public/background.png (generated placeholder)");
  } else {
    console.log("  = public/background.png (exists, keeping)");
  }

  for (const size of ICON_SIZES) {
    await sharp(logoPath)
      .resize(size, size, { fit: "cover", position: "centre" })
      .png()
      .toFile(path.join(BRAND, `icon-${size}.png`));
  }
  // Full-quality 512 copy of the logo for the manifest's 512 entry + OG image.
  await sharp(logoPath).png().toFile(path.join(BRAND, "icon-512.png"));

  console.log(`  + public/brand/icon-{${ICON_SIZES.join(",")}}.png`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
