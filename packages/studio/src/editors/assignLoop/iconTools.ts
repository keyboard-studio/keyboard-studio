/**
 * iconTools — pixel drawing operations for the icon editor.
 *
 * All tools operate on a 256×256 RGBA buffer (top-down row order),
 * the editor's canonical working resolution. Tools are pure functions
 * taking the pixel buffer plus parameters; the editor owns undo.
 */

export const ICON_SIZE = 256;

/** Canonical pixel buffer: 256×256 RGBA, top-down. */
export type PixelBuffer = Uint8ClampedArray<ArrayBuffer>;

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
  meas.font = `${pixelSize}px "Courier New", ui-monospace, monospace`;
  const w = Math.max(1, Math.ceil(meas.measureText(text).width));
  canvas.width = w;
  canvas.height = pixelSize + 8;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Crisp low-res rendering: no smoothing, hard alpha.
  ctx.imageSmoothingEnabled = false;
  ctx.font = `${pixelSize}px "Courier New", ui-monospace, monospace`;
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

/** Generate a default icon: first letter of `label` on a colored tile. */
export function generateDefaultIcon(label: string): PixelBuffer {
  const px: PixelBuffer = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
  // Navy tile background (studio theme).
  const bg: Rgba = [27, 58, 95, 255];
  for (let i = 0; i < px.length; i += 4) {
    px[i] = bg[0];
    px[i + 1] = bg[1];
    px[i + 2] = bg[2];
    px[i + 3] = bg[3];
  }
  const letter = (label.trim().charAt(0) || "K").toUpperCase();
  const pixelSize = 128;
  // Measure, then draw centered directly.
  const meas = document.createElement("canvas").getContext("2d");
  let tw = pixelSize;
  if (meas) {
    meas.font = `${pixelSize}px "Courier New", ui-monospace, monospace`;
    tw = Math.ceil(meas.measureText(letter).width);
  }
  drawText(
    px,
    letter,
    Math.round((ICON_SIZE - tw) / 2),
    Math.round((ICON_SIZE - pixelSize) / 2),
    [255, 255, 255, 255],
    pixelSize,
  );
  // Subtle border.
  drawRect(px, 8, 8, ICON_SIZE - 9, ICON_SIZE - 9, [255, 255, 255, 255], false);
  return px;
}
