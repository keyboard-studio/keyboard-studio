/**
 * svg — the deterministic SVG string emitter shared by every layout chart
 * (spec 076 T049, FR-014).
 *
 * No DOM, no timestamps, no randomness: every element is built by plain
 * string concatenation with a fixed attribute order, and every number is
 * rounded through {@link formatSvgNumber} so two renders of the same input
 * are byte-identical.
 */

import { escapeHtml } from "../shared/escapeHtml.js";

/**
 * Fixed-precision number formatter: 2 decimal places, always. A constant
 * decimal width (rather than trimming trailing zeros) is what removes the
 * "is `1.10` the same distance as `1.1`" ambiguity the format has to avoid —
 * every number in a chart renders at the same width either way.
 */
export function formatSvgNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const normalized = rounded === 0 ? 0 : rounded; // avoid emitting "-0.00"
  return normalized.toFixed(2);
}

/** One keycap: a rect plus a centered label, attributes in a fixed order. */
export interface SvgKeycapOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly keycapClassName: string;
  /** `""` to omit the label's own class attribute. */
  readonly labelClassName: string;
  readonly fontStack: string;
  readonly fontSize: number;
  readonly label: string;
}

export function renderKeycapSvg(opts: SvgKeycapOptions): string {
  const { x, y, width, height, keycapClassName, labelClassName, fontStack, fontSize, label } = opts;
  const rect =
    `<rect x="${formatSvgNumber(x)}" y="${formatSvgNumber(y)}" width="${formatSvgNumber(width)}" ` +
    `height="${formatSvgNumber(height)}" class="${escapeHtml(keycapClassName)}"/>`;
  const textX = x + width / 2;
  const textY = y + height / 2;
  const classAttr = labelClassName !== "" ? ` class="${escapeHtml(labelClassName)}"` : "";
  const text =
    `<text x="${formatSvgNumber(textX)}" y="${formatSvgNumber(textY)}" ` +
    `font-family="${escapeHtml(fontStack)}" font-size="${formatSvgNumber(fontSize)}"${classAttr}>` +
    `${escapeHtml(label)}</text>`;
  return `<g>${rect}${text}</g>`;
}

/** The outer `<svg>` document: fixed attribute order, a `<title>`, no timestamps. */
export interface SvgDocumentOptions {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly body: string;
}

export function renderSvgDocument(opts: SvgDocumentOptions): string {
  const { width, height, title, body } = opts;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatSvgNumber(width)} ${formatSvgNumber(height)}" ` +
    `width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}">` +
    `<title>${escapeHtml(title)}</title>${body}</svg>`
  );
}
