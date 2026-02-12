#!/usr/bin/env npx tsx
/**
 * Compose Destiny Parchment - Mogogo Share Image Generator
 *
 * Generates a 1080×1080 share image by compositing:
 *   1. Parchment background
 *   2. Decorative header ("✦ LE DESTIN A PARLÉ ✦")
 *   3. Activity title text (centered)
 *   4. Decision journey path (optional)
 *   5. Metadata gauges (social, energy, budget)
 *   6. Decorative footer ("🦉 Mogogo a parlé 🦉")
 *   7. Mogogo mascot (bottom-right, with drop shadow)
 *   8. QR code (bottom-left, no label)
 *
 * Usage:
 *   npx tsx scripts/compose-destiny-parchment.ts \
 *     --title "Aller au Cinéma" \
 *     --variant cinema \
 *     --energy 3 \
 *     --budget "Éco" \
 *     --social "Amis"
 */

import sharp from "sharp";
import QRCode from "qrcode";
import path from "path";
import { parseArgs } from "util";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CANVAS_SIZE = 1080;
const ASSETS_DIR = path.resolve(__dirname, "../assets/images/destiny-parchment");
const DEFAULT_OUTPUT = path.resolve(__dirname, "../result_share.jpg");
const JPEG_QUALITY = 90;

// Mascot
const MASCOT_SCALE = 0.40;
const MASCOT_SIZE = Math.round(CANVAS_SIZE * MASCOT_SCALE);

// QR code — bottom-left, no label
const QR_SIZE = 65;
const QR_MARGIN = 60;

// Background
const BG_COLOR = { r: 0x12, g: 0x12, b: 0x12 };

// Colors — high-contrast palette on parchment background
const COLOR = {
  title: "#1A0D05",           // near-black warm brown
  header: "#8B5E3C",          // decorative warm brown
  journeyLabel: "#6B4D3A",    // medium brown
  journey: "#2C1A10",         // dark brown
  metaLabel: "#1A0D05",       // dark
  metaValue: "#3D2B1F",       // rich brown
  gaugeFilled: "#C7722B",     // warm amber accent
  gaugeEmpty: "#C9B99A",      // muted parchment tone
  footer: "#6B4D3A",          // medium brown
  qr: "#000000",              // pure black for scannability
};

// Typography
const FONT = {
  serif: "Georgia, 'Times New Roman', 'DejaVu Serif', serif",
};

// Font sizes
const FONT_SIZE = {
  header: 20,
  title: 60,
  journeyLabel: 18,
  journey: 22,
  metaLabel: 24,
  footer: 22,
};

// Gauge dots
const GAUGE = {
  dotRadius: 10,
  dotSpacing: 30,
};

// Available mascot variants
const VARIANTS = ["chill", "cinema", "eat", "party", "sport"] as const;
type Variant = (typeof VARIANTS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap text to fit within maxWidth (approximate char-width heuristic). */
function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const charWidth = fontSize * 0.52;
  const maxChars = Math.floor(maxWidth / charWidth);
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Create a full-canvas SVG text overlay (centered horizontally). */
function createTextSvg(params: {
  text: string;
  fontSize: number;
  y: number;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  maxWidth?: number;
}): Buffer {
  const {
    text, fontSize, y,
    color = COLOR.title,
    fontWeight = "normal",
    fontStyle = "normal",
    maxWidth = 750,
  } = params;

  const lines = wrapText(text, fontSize, maxWidth);
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const startY = y - totalHeight / 2 + fontSize;

  const tspans = lines
    .map((line, i) =>
      `<tspan x="540" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  const svg = `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <text x="540" y="${startY}" text-anchor="middle"
      font-family="${FONT.serif}" font-size="${fontSize}"
      font-weight="${fontWeight}" font-style="${fontStyle}" fill="${color}"
    >${tspans}</text>
  </svg>`;

  return Buffer.from(svg);
}

/** Map budget label to gauge level (0–3). */
function budgetToLevel(budget: string): number {
  const b = budget.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (b === "gratuit") return 0;
  if (b === "eco") return 1;
  if (b === "standard") return 2;
  if (b === "premium") return 3;
  return 2;
}

/** Budget level to display label. */
function budgetLabel(budget: string): string {
  const level = budgetToLevel(budget);
  return ["Gratuit", "Éco", "Standard", "Premium"][level] ?? budget;
}

/** Render gauge dots as SVG <circle> elements. */
function renderGaugeDots(
  filled: number, total: number, startX: number, cy: number,
): string {
  let svg = "";
  for (let i = 0; i < total; i++) {
    const cx = startX + i * GAUGE.dotSpacing;
    svg += i < filled
      ? `<circle cx="${cx}" cy="${cy}" r="${GAUGE.dotRadius}" fill="${COLOR.gaugeFilled}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${GAUGE.dotRadius}" fill="none" stroke="${COLOR.gaugeEmpty}" stroke-width="2.5"/>`;
  }
  return svg;
}

/** Create full-canvas SVG with metadata gauges (social, energy, budget). */
function createMetadataBlockSvg(params: {
  social?: string;
  energy?: number;
  budget?: string;
  startY: number;
}): { svg: Buffer; height: number } {
  const { social, energy, budget, startY } = params;
  const lineHeight = 55;
  const diamondX = 310;       // fixed ◆ position
  const labelX = 335;         // all labels left-aligned here
  const valueX = 500;         // all values/gauges left-aligned here

  let svgContent = "";
  let lineIdx = 0;

  if (social) {
    const y = startY + lineIdx * lineHeight;
    svgContent += `
      <text x="${diamondX}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel}"
        fill="${COLOR.gaugeFilled}">◆</text>
      <text x="${labelX}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel}"
        fill="${COLOR.metaLabel}" font-weight="bold">Ambiance</text>
      <text x="${valueX}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel}"
        fill="${COLOR.metaValue}">${escapeXml(social)}</text>`;
    lineIdx++;
  }

  if (energy !== undefined) {
    const y = startY + lineIdx * lineHeight;
    svgContent += `
      <text x="${diamondX}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel}"
        fill="${COLOR.gaugeFilled}">◆</text>
      <text x="${labelX}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel}"
        fill="${COLOR.metaLabel}" font-weight="bold">Énergie</text>
      ${renderGaugeDots(energy, 5, valueX + GAUGE.dotRadius, y - GAUGE.dotRadius + 3)}`;
    lineIdx++;
  }

  if (budget) {
    const y = startY + lineIdx * lineHeight;
    const level = budgetToLevel(budget);
    svgContent += `
      <text x="${diamondX}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel}"
        fill="${COLOR.gaugeFilled}">◆</text>
      <text x="${labelX}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel}"
        fill="${COLOR.metaLabel}" font-weight="bold">Budget</text>
      ${renderGaugeDots(level, 3, valueX + GAUGE.dotRadius, y - GAUGE.dotRadius + 3)}
      <text x="${valueX + GAUGE.dotRadius + 3 * GAUGE.dotSpacing + 15}" y="${y}" text-anchor="start"
        font-family="${FONT.serif}" font-size="${FONT_SIZE.metaLabel - 4}"
        fill="${COLOR.metaValue}" font-style="italic">${escapeXml(budgetLabel(budget))}</text>`;
    lineIdx++;
  }

  const totalHeight = lineIdx * lineHeight;
  const svg = `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;

  return { svg: Buffer.from(svg), height: totalHeight };
}

/** Generate a QR code as PNG buffer. */
async function generateQrCode(text: string, size: number): Promise<Buffer> {
  const dataUrl = await QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: COLOR.qr, light: "#00000000" },
    errorCorrectionLevel: "M",
  });
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

/** Create a drop shadow version of an image. */
async function addDropShadow(
  imageBuffer: Buffer, width: number, height: number,
): Promise<Buffer> {
  const shadowOffset = 8;
  const shadowBlur = 15;
  const padded = width + shadowBlur * 2 + shadowOffset;
  const paddedH = height + shadowBlur * 2 + shadowOffset;
  const bg = { r: 0, g: 0, b: 0, alpha: 0 };

  const shadow = await sharp(imageBuffer)
    .resize(width, height, { fit: "contain", background: bg })
    .ensureAlpha()
    .modulate({ brightness: 0 })
    .blur(shadowBlur)
    .toBuffer();

  return sharp({
    create: { width: padded, height: paddedH, channels: 4, background: bg },
  })
    .composite([
      {
        input: await sharp(shadow).ensureAlpha(0.4).toBuffer(),
        left: shadowBlur + shadowOffset,
        top: shadowBlur + shadowOffset,
      },
      {
        input: await sharp(imageBuffer)
          .resize(width, height, { fit: "contain", background: bg })
          .toBuffer(),
        left: shadowBlur,
        top: shadowBlur,
      },
    ])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function compose(options: {
  title: string;
  variant: Variant;
  journey?: string[];
  energy?: number;
  budget?: string;
  social?: string;
  output?: string;
}) {
  const { title, variant, journey, energy, budget, social, output = DEFAULT_OUTPUT } = options;

  console.log(`🦉 Mogogo Destiny Parchment Generator`);
  console.log(`   Title:   "${title}"`);
  console.log(`   Variant: ${variant}`);
  if (social) console.log(`   Social:  ${social}`);
  console.log(`   Output:  ${output}`);

  // --- 1. Background ---
  const bgPath = path.join(ASSETS_DIR, "parchment.webp");
  const parchmentLayer = await sharp(bgPath).resize(CANVAS_SIZE, CANVAS_SIZE).png().toBuffer();
  const baseBuffer = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 4, background: { ...BG_COLOR, alpha: 255 } },
  })
    .composite([{ input: parchmentLayer, top: 0, left: 0 }])
    .png()
    .toBuffer();

  // --- 2. Dynamic vertical layout ---
  let cursorY = 155;

  // Header: ✦ LE DESTIN A PARLÉ ✦
  const headerSvg = createTextSvg({
    text: "✦  LE DESTIN A PARLÉ  ✦",
    fontSize: FONT_SIZE.header,
    y: cursorY,
    color: COLOR.header,
    fontWeight: "bold",
  });
  cursorY += 120;

  // Title
  const titleSvg = createTextSvg({
    text: title,
    fontSize: FONT_SIZE.title,
    y: cursorY,
    fontWeight: "bold",
    color: COLOR.title,
  });
  const titleLines = wrapText(title, FONT_SIZE.title, 750);
  cursorY += Math.max(80, titleLines.length * FONT_SIZE.title * 1.3 + 30);

  // Journey (optional)
  let journeyLabelSvg: Buffer | null = null;
  let journeySvg: Buffer | null = null;
  if (journey && journey.length > 0) {
    journeyLabelSvg = createTextSvg({
      text: "★  MON CHEMIN  ★",
      fontSize: FONT_SIZE.journeyLabel,
      y: cursorY,
      color: COLOR.journeyLabel,
    });
    cursorY += 35;
    journeySvg = createTextSvg({
      text: journey.join("  ✦  "),
      fontSize: FONT_SIZE.journey,
      y: cursorY,
      color: COLOR.journey,
      fontStyle: "italic",
    });
    cursorY += 70;
  }

  // Metadata gauges
  const hasMetadata = social || energy !== undefined || budget;
  let metaBlockSvg: Buffer | null = null;
  if (hasMetadata) {
    const result = createMetadataBlockSvg({ social, energy, budget, startY: cursorY });
    metaBlockSvg = result.svg;
    cursorY += result.height + 30;
  }

  // Footer
  cursorY = Math.min(cursorY + 20, 750);
  const footerSvg = createTextSvg({
    text: "— ★ Mogogo a parlé ★ —",
    fontSize: FONT_SIZE.footer,
    y: cursorY,
    color: COLOR.footer,
    fontStyle: "italic",
  });

  // Seal below footer
  const SEAL_SIZE = 100;
  const sealPath = path.join(ASSETS_DIR, "seal.webp");
  const sealBuffer = await sharp(sealPath)
    .resize(SEAL_SIZE, SEAL_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const sealTop = cursorY + 30;
  const sealLeft = Math.round((CANVAS_SIZE - SEAL_SIZE) / 2);

  // --- 3. Mascot with drop shadow ---
  const mascotPath = path.join(ASSETS_DIR, `mogogo-${variant}.webp`);
  const mascotRaw = await sharp(mascotPath)
    .resize(MASCOT_SIZE, MASCOT_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const mascotWithShadow = await addDropShadow(mascotRaw, MASCOT_SIZE, MASCOT_SIZE);
  const mascotMeta = await sharp(mascotWithShadow).metadata();
  const mascotW = mascotMeta.width ?? MASCOT_SIZE;
  const mascotH = mascotMeta.height ?? MASCOT_SIZE;

  // --- 4. QR Code (bottom-left, no label) ---
  const qrBuffer = await generateQrCode("https://play.google.com/apps/4701695797260563642", QR_SIZE);

  // --- 5. Composite everything ---
  const composites: sharp.OverlayOptions[] = [
    { input: headerSvg, top: 0, left: 0 },
    { input: titleSvg, top: 0, left: 0 },
    { input: footerSvg, top: 0, left: 0 },
    { input: sealBuffer, left: sealLeft, top: sealTop },
    {
      input: mascotWithShadow,
      left: Math.max(0, CANVAS_SIZE - mascotW + 30),
      top: Math.max(0, CANVAS_SIZE - mascotH + 20),
    },
    {
      input: qrBuffer,
      left: QR_MARGIN + 110,
      top: CANVAS_SIZE - QR_SIZE - QR_MARGIN - 70,
    },
  ];

  if (journeyLabelSvg) composites.push({ input: journeyLabelSvg, top: 0, left: 0 });
  if (journeySvg) composites.push({ input: journeySvg, top: 0, left: 0 });
  if (metaBlockSvg) composites.push({ input: metaBlockSvg, top: 0, left: 0 });

  await sharp(baseBuffer)
    .composite(composites)
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(output);

  console.log(`\n   ✅ Image saved to: ${output}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    title: { type: "string", short: "t" },
    variant: { type: "string", short: "v" },
    journey: { type: "string", short: "j" },
    energy: { type: "string", short: "e" },
    budget: { type: "string", short: "b" },
    social: { type: "string", short: "s" },
    output: { type: "string", short: "o" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(`
Usage: npx tsx scripts/compose-destiny-parchment.ts [options]

Options:
  -t, --title    Activity title (required)
  -v, --variant  Mascot variant: ${VARIANTS.join(", ")} (required)
  -j, --journey  Decision path, comma-separated (e.g., "Sport,Extérieur,En groupe")
  -e, --energy   Energy level (1-5)
  -b, --budget   Budget label (e.g., "Éco", "Standard", "Premium")
  -s, --social   Social context (e.g., "Seul", "En duo", "Amis", "Famille")
  -o, --output   Output file path (default: result_share.jpg)
  -h, --help     Show this help

Example:
  npx tsx scripts/compose-destiny-parchment.ts \\
    --title "Aller au Cinéma" \\
    --variant cinema \\
    --journey "Culture,En duo,Soirée" \\
    --energy 3 \\
    --budget "Éco" \\
    --social "Amis"
`);
  process.exit(0);
}

if (!values.title) {
  console.error("Error: --title is required");
  process.exit(1);
}

if (!values.variant || !VARIANTS.includes(values.variant as Variant)) {
  console.error(`Error: --variant must be one of: ${VARIANTS.join(", ")}`);
  process.exit(1);
}

compose({
  title: values.title,
  variant: values.variant as Variant,
  journey: values.journey ? values.journey.split(",").map(s => s.trim()) : undefined,
  energy: values.energy ? parseInt(values.energy, 10) : undefined,
  budget: values.budget || undefined,
  social: values.social || undefined,
  output: values.output || undefined,
}).catch((err) => {
  console.error("Composition failed:", err);
  process.exit(1);
});
