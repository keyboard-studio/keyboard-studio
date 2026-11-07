/**
 * iconTools — pixel drawing operations for the icon editor.
 *
 * All tools operate on a 48×48 RGBA buffer (top-down row order),
 * the editor's canonical working resolution: 48px is the largest size
 * an .ico entry for a keyboard icon ever needs, so the editor works
 * 1:1 at that size and shows it big instead of editing high-res and
 * downscaling. Tools are pure functions taking the pixel buffer plus
 * parameters; the editor owns undo.
 */

export const ICON_SIZE = 48;

/** Canonical pixel buffer: 48×48 RGBA, top-down. */
export type PixelBuffer = Uint8ClampedArray<ArrayBuffer>;

/** A blank white canvas — the editor's starting point. */
export function createBlankIcon(): PixelBuffer {
  const px: PixelBuffer = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = 255;
  }
  return px;
}

export type Rgba = [number, number, number, number];

export type ToolId =
  | "pen"
  | "eraser"
  | "line"
  | "fill"
  | "box"
  | "boxFill"
  | "circle"
  | "circleFill"
  | "text"
  | "picker";

function idx(x: number, y: number): number {
  return (y * ICON_SIZE + x) * 4;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < ICON_SIZE && y < ICON_SIZE;
}

export function setPixel(
  px: PixelBuffer,
  x: number,
  y: number,
  c: Rgba,
): void {
  if (!inBounds(x, y)) return;
  const i = idx(Math.round(x), Math.round(y));
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = c[3];
}

export function getPixel(px: PixelBuffer, x: number, y: number): Rgba {
  const cx = Math.max(0, Math.min(ICON_SIZE - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(ICON_SIZE - 1, Math.round(y)));
  const i = idx(cx, cy);
  return [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0, px[i + 3] ?? 0];
}

/** Bresenham line. */
export function drawLine(
  px: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgba,
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = -Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPixel(px, ix0, iy0, c);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ix0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

/** Scanline flood fill (iterative, no recursion). */
export function floodFill(
  px: PixelBuffer,
  sx: number,
  sy: number,
  c: Rgba,
): void {
  const x0 = Math.round(sx);
  const y0 = Math.round(sy);
  if (!inBounds(x0, y0)) return;
  const target = getPixel(px, x0, y0);
  if (
    target[0] === c[0] &&
    target[1] === c[1] &&
    target[2] === c[2] &&
    target[3] === c[3]
  ) {
    return;
  }
  const stack: Array<[number, number]> = [[x0, y0]];
  const matches = (x: number, y: number): boolean => {
    const i = idx(x, y);
    return (
      px[i] === target[0] &&
      px[i + 1] === target[1] &&
      px[i + 2] === target[2] &&
      px[i + 3] === target[3]
    );
  };
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (!inBounds(x, y) || !matches(x, y)) continue;
    // Expand horizontally.
    let xl = x;
    while (xl >= 0 && matches(xl, y)) xl--;
    xl++;
    let xr = x;
    while (xr < ICON_SIZE && matches(xr, y)) xr++;
    xr--;
    for (let x2 = xl; x2 <= xr; x2++) {
      const i = idx(x2, y);
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = c[3];
      if (y > 0 && matches(x2, y - 1)) stack.push([x2, y - 1]);
      if (y < ICON_SIZE - 1 && matches(x2, y + 1)) stack.push([x2, y + 1]);
    }
  }
}

export function drawRect(
  px: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgba,
  filled: boolean,
): void {
  const ax = Math.round(Math.min(x0, x1));
  const bx = Math.round(Math.max(x0, x1));
  const ay = Math.round(Math.min(y0, y1));
  const by = Math.round(Math.max(y0, y1));
  if (filled) {
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) setPixel(px, x, y, c);
    }
  } else {
    drawLine(px, ax, ay, bx, ay, c);
    drawLine(px, bx, ay, bx, by, c);
    drawLine(px, bx, by, ax, by, c);
    drawLine(px, ax, by, ax, ay, c);
  }
}

/** Midpoint circle. */
export function drawCircle(
  px: PixelBuffer,
  cx: number,
  cy: number,
  r: number,
  c: Rgba,
  filled: boolean,
): void {
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  const ir = Math.max(1, Math.round(r));
  if (filled) {
    for (let y = -ir; y <= ir; y++) {
      const hw = Math.floor(Math.sqrt(ir * ir - y * y));
      for (let x = -hw; x <= hw; x++) setPixel(px, icx + x, icy + y, c);
    }
    return;
  }
  let x = ir;
  let y = 0;
  let err = 0;
  while (x >= y) {
    setPixel(px, icx + x, icy + y, c);
    setPixel(px, icx + y, icy + x, c);
    setPixel(px, icx - y, icy + x, c);
    setPixel(px, icx - x, icy + y, c);
    setPixel(px, icx - x, icy - y, c);
    setPixel(px, icx - y, icy - x, c);
    setPixel(px, icx + y, icy - x, c);
    setPixel(px, icx + x, icy - y, c);
    y++;
    if (err <= 0) {
      err += 2 * y + 1;
    } else {
      x--;
      err -= 2 * x + 1;
    }
  }
}

/**
 * Render text into the pixel buffer at (x, y) — top-left anchor.
 * Uses a low-res-friendly monospace stack; callers choose a pixel size
 * (e.g. 16/24/32). Text is drawn 1:1 (no smoothing tricks) so it stays
 * crisp when downscaled to 16×16.
 */
export function iconFont(pixelSize: number): string {
  return `${pixelSize}px "Courier New", ui-monospace, monospace`;
}

export function drawText(
  px: PixelBuffer,
  text: string,
  x: number,
  y: number,
  c: Rgba,
  pixelSize: number,
): void {
  const canvas = document.createElement("canvas");
  // Measure first so the canvas is exactly sized.
  const meas = document.createElement("canvas").getContext("2d");
  if (!meas) return;
  meas.font = iconFont(pixelSize);
  const w = Math.max(1, Math.ceil(meas.measureText(text).width));
  canvas.width = w;
  canvas.height = pixelSize + 8;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Crisp low-res rendering: no smoothing, hard alpha.
  ctx.imageSmoothingEnabled = false;
  ctx.font = iconFont(pixelSize);
  ctx.textBaseline = "top";
  ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
  ctx.fillText(text, 0, 4);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const ox = Math.round(x);
  const oy = Math.round(y);
  for (let dy = 0; dy < canvas.height; dy++) {
    for (let dx = 0; dx < canvas.width; dx++) {
      const s = (dy * canvas.width + dx) * 4;
      if ((img.data[s + 3] ?? 0) < 128) continue; // hard 1-bit alpha cutoff
      setPixel(px, ox + dx, oy + dy, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Initials generator (#1550)
// ---------------------------------------------------------------------------

/**
 * Derive display initials for the icon generator: the first letters of
 * the first two words ("Ewondo Keyboard" → "EK"), else the first two
 * letters of a single word ("Ewondo" → "EW"). Letters only — digits and
 * punctuation are skipped; an empty name yields "".
 */
export function deriveInitials(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w.length > 0);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}

/**
 * Contrasting text colour for a flat background: white on dark, black on
 * light (relative luminance, Rec. 709 weights, 0.5 midpoint).
 */
export function initialsTextColor(background: Rgba): Rgba {
  const [r, g, b] = background;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? [0, 0, 0, 255] : [255, 255, 255, 255];
}

/**
 * The pixel size for generated initials: one big letter, two medium,
 * three or more small — every length fits the 48px canvas.
 */
export function initialsFontSize(initials: string): number {
  if (initials.length <= 1) return 28;
  if (initials.length === 2) return 20;
  return 14;
}

/**
 * Fill a fresh canvas with a flat background and draw `initials` centred
 * in a contrasting colour — the "give it a face" generator (#1550). The
 * raster is `drawText`'s monospace font, so the letters stay crisp at
 * 16×16. A blank/whitespace `initials` yields the flat background alone.
 * (The -4 on the vertical centre compensates `drawText`'s +4 glyph offset.)
 */
export function generateInitialsIcon(initials: string, background: Rgba): PixelBuffer {
  const px = createBlankIcon();
  drawRect(px, 0, 0, ICON_SIZE - 1, ICON_SIZE - 1, background, true);
  const text = initials.trim().toUpperCase();
  if (text === "") return px;
  const size = initialsFontSize(text);
  const meas = document.createElement("canvas").getContext("2d");
  let x = 0;
  if (meas !== null) {
    meas.font = iconFont(size);
    x = Math.round((ICON_SIZE - meas.measureText(text).width) / 2);
  }
  const y = Math.round((ICON_SIZE - size) / 2) - 4;
  drawText(px, text, x, y, initialsTextColor(background), size);
  return px;
}

/** A small, low-res-friendly palette (plus transparent). */
export const ICON_PALETTE: Array<{ name: string; rgba: Rgba }> = [
  { name: "transparent", rgba: [0, 0, 0, 0] },
  { name: "black", rgba: [0, 0, 0, 255] },
  { name: "white", rgba: [255, 255, 255, 255] },
  { name: "red", rgba: [220, 38, 38, 255] },
  { name: "orange", rgba: [234, 88, 12, 255] },
  { name: "yellow", rgba: [250, 204, 21, 255] },
  { name: "green", rgba: [22, 163, 74, 255] },
  { name: "teal", rgba: [13, 148, 136, 255] },
  { name: "blue", rgba: [37, 99, 235, 255] },
  { name: "indigo", rgba: [79, 70, 229, 255] },
  { name: "purple", rgba: [147, 51, 234, 255] },
  { name: "pink", rgba: [219, 39, 119, 255] },
  { name: "brown", rgba: [120, 72, 20, 255] },
  { name: "gray-dark", rgba: [75, 85, 99, 255] },
  { name: "gray", rgba: [156, 163, 175, 255] },
  { name: "gray-light", rgba: [229, 231, 235, 255] },
];

/* (generateDefaultIcon was removed with the 2026-11-06 three-option design:
   when the template has no usable .ico the step offers only Create — a
   blank white canvas — so no generated letter tile is needed.) */
