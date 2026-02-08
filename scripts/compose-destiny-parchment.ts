#!/usr/bin/env npx tsx
/**
 * Compose Destiny Parchment - Mogogo Share Image Generator
 *
 * Generates a 1080x1080 share image by compositing:
 *   1. Parchment background
 *   2. Activity title text (centered)
 *   3. Metadata line (energy, budget)
 *   4. Mogogo mascot (bottom-right, with drop shadow)
 *   5. QR code placeholder (bottom-left)
 *
 * Usage:
 *   npx tsx scripts/compose-destiny-parchment.ts \
 *     --title "Aller au Cinéma" \
 *     --variant cinema \
 *     --energy 3 \
 *     --budget "Éco"
 *
 *   npx tsx scripts/compose-destiny-parchment.ts \
 *     --title "Soirée Bowling" \
 *     --variant party \
 *     --energy 4 \
 *     --budget "Standard" \
 *     --output my_share.jpg
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

// Mascot sizing & position
const MASCOT_SCALE = 0.40; // 40% of canvas width
const MASCOT_SIZE = Math.round(CANVAS_SIZE * MASCOT_SCALE);

// QR code
const QR_SIZE = 140;
const QR_MARGIN = 60;

// Background color (dark theme)
const BG_COLOR = { r: 0x12, g: 0x12, b: 0x12 }; // #121212

// Text config
const TITLE_FONT_SIZE = 64;
const TITLE_Y = 340;
const META_FONT_SIZE = 30;
const META_Y = TITLE_Y + 220;
const LABEL_FONT_SIZE = 24;
const LABEL_Y = META_Y + 65;

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

/** Wrap text to fit within maxWidth (approximate, monospace-ish heuristic). */
function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const charWidth = fontSize * 0.52; // approximate average char width for serif
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

/** Create an SVG text overlay. */
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
    text,
    fontSize,
    y,
    color = "#3B2314",
    fontWeight = "normal",
    fontStyle = "normal",
    maxWidth = 750,
  } = params;

  const lines = wrapText(text, fontSize, maxWidth);
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const startY = y - totalHeight / 2 + fontSize;

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="540" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  const svg = `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <text
      x="540" y="${startY}"
      text-anchor="middle"
      font-family="Georgia, 'Times New Roman', 'DejaVu Serif', serif"
      font-size="${fontSize}"
      font-weight="${fontWeight}"
      font-style="${fontStyle}"
      fill="${color}"
    >${tspans}</text>
  </svg>`;

  return Buffer.from(svg);
}

/** Generate a QR code as PNG buffer. */
async function generateQrCode(text: string, size: number): Promise<Buffer> {
  const dataUrl = await QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: "#3B2314", light: "#00000000" },
    errorCorrectionLevel: "M",
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64, "base64");
}

/** Create a drop shadow version of an image. */
async function addDropShadow(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  // Create shadow: slightly offset, blurred, semi-transparent
  const shadowOffset = 8;
  const shadowBlur = 15;
  const padded = width + shadowBlur * 2 + shadowOffset;
  const paddedH = height + shadowBlur * 2 + shadowOffset;

  const shadow = await sharp(imageBuffer)
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    // Tint to black for shadow
    .modulate({ brightness: 0 })
    .blur(shadowBlur)
    .toBuffer();

  // Composite shadow + original on transparent canvas
  return sharp({
    create: {
      width: padded,
      height: paddedH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(shadow)
          .ensureAlpha(0.4)
          .toBuffer(),
        left: shadowBlur + shadowOffset,
        top: shadowBlur + shadowOffset,
      },
      {
        input: await sharp(imageBuffer)
          .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
  energy?: number;
  budget?: string;
  output?: string;
}) {
  const {
    title,
    variant,
    energy,
    budget,
    output = DEFAULT_OUTPUT,
  } = options;

  console.log(`🦉 Mogogo Destiny Parchment Generator`);
  console.log(`   Title:   "${title}"`);
  console.log(`   Variant: ${variant}`);
  console.log(`   Output:  ${output}`);

  // 1. Solid color base + transparent parchment background
  const bgPath = path.join(ASSETS_DIR, "background.webp");
  const parchmentLayer = await sharp(bgPath)
    .resize(CANVAS_SIZE, CANVAS_SIZE)
    .png()
    .toBuffer();

  const baseBuffer = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { ...BG_COLOR, alpha: 255 },
    },
  })
    .composite([{ input: parchmentLayer, top: 0, left: 0 }])
    .png()
    .toBuffer();

  const background = sharp(baseBuffer);

  // 2. Prepare text overlays
  const titleSvg = createTextSvg({
    text: title,
    fontSize: TITLE_FONT_SIZE,
    y: TITLE_Y,
    fontWeight: "bold",
    color: "#3B2314",
  });

  // 3. Metadata line
  const metaParts: string[] = [];
  if (energy !== undefined) metaParts.push(`Énergie : ${energy}/5`);
  if (budget) metaParts.push(`Budget : ${budget}`);
  const metaText = metaParts.join("  •  ");

  const metaSvg = metaText
    ? createTextSvg({
        text: metaText,
        fontSize: META_FONT_SIZE,
        y: META_Y,
        color: "#6B5344",
        fontStyle: "italic",
      })
    : null;

  // 4. "Mogogo a parlé" label
  const labelSvg = createTextSvg({
    text: "— Mogogo a parlé —",
    fontSize: LABEL_FONT_SIZE,
    y: LABEL_Y,
    color: "#8B7364",
    fontStyle: "italic",
  });

  // 5. Mascot with drop shadow
  const mascotPath = path.join(ASSETS_DIR, `mogogo-${variant}.webp`);
  const mascotRaw = await sharp(mascotPath)
    .resize(MASCOT_SIZE, MASCOT_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const mascotWithShadow = await addDropShadow(mascotRaw, MASCOT_SIZE, MASCOT_SIZE);
  const mascotMeta = await sharp(mascotWithShadow).metadata();
  const mascotW = mascotMeta.width ?? MASCOT_SIZE;
  const mascotH = mascotMeta.height ?? MASCOT_SIZE;

  // Position: bottom-right, slightly overflowing
  const mascotLeft = CANVAS_SIZE - mascotW + 30;
  const mascotTop = CANVAS_SIZE - mascotH + 20;

  // 6. QR Code placeholder
  const qrBuffer = await generateQrCode("https://mogogo.app", QR_SIZE);

  // QR label SVG
  const qrLabelSvg = `<svg width="${QR_SIZE + 20}" height="30" xmlns="http://www.w3.org/2000/svg">
    <text x="${(QR_SIZE + 20) / 2}" y="20"
      text-anchor="middle"
      font-family="Georgia, 'Times New Roman', 'DejaVu Serif', serif"
      font-size="14"
      fill="#6B5344"
      font-style="italic"
    >Scanne pour ton destin</text>
  </svg>`;

  // 7. Composite everything
  const composites: sharp.OverlayOptions[] = [
    { input: titleSvg, top: 0, left: 0 },
    { input: labelSvg, top: 0, left: 0 },
    {
      input: mascotWithShadow,
      left: Math.max(0, mascotLeft),
      top: Math.max(0, mascotTop),
    },
    {
      input: qrBuffer,
      left: Math.round((CANVAS_SIZE - QR_SIZE) / 2),
      top: CANVAS_SIZE - QR_SIZE - 260,
    },
    {
      input: Buffer.from(qrLabelSvg),
      left: Math.round((CANVAS_SIZE - QR_SIZE - 20) / 2),
      top: CANVAS_SIZE - 255,
    },
  ];

  if (metaSvg) {
    composites.splice(1, 0, { input: metaSvg, top: 0, left: 0 });
  }

  await background
    .composite(composites)
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(output);

  console.log(`\n   Done! Image saved to: ${output}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    title: { type: "string", short: "t" },
    variant: { type: "string", short: "v" },
    energy: { type: "string", short: "e" },
    budget: { type: "string", short: "b" },
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
  -e, --energy   Energy level (1-5)
  -b, --budget   Budget label (e.g., "Éco", "Standard", "Premium")
  -o, --output   Output file path (default: result_share.jpg)
  -h, --help     Show this help

Example:
  npx tsx scripts/compose-destiny-parchment.ts \\
    --title "Aller au Cinéma" \\
    --variant cinema \\
    --energy 3 \\
    --budget "Éco"
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
  energy: values.energy ? parseInt(values.energy, 10) : undefined,
  budget: values.budget || undefined,
  output: values.output || undefined,
}).catch((err) => {
  console.error("Composition failed:", err);
  process.exit(1);
});
