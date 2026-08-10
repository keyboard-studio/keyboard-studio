// fontSupport — per-glyph font-support detection for the selected Phase B
// glyph font (see useGlyphFontStack.ts / surveyStyles.ts's phaseBFontStack).
//
// CharacterMapPane must show EVERY character it lists, even ones the
// author's chosen font can't render — and it must show a DETERMINISTIC box
// placeholder for those, rather than relying on the OS/browser's own
// missing-glyph ("tofu") rendering, which is inconsistent across systems
// (some draw a visible box, some draw blank). This module answers "can the
// selected font stack actually render this glyph" so CharacterMapPane can
// decide glyph-vs-box per cell.
//
// Technique: Canvas 2D `measureText`. Render the same text once with the
// author's font stack, once with each of two generic baseline families
// (monospace, serif). If the target stack's rendered width matches EITHER
// baseline, the font fell back to a generic face rather than drawing its own
// glyph — comparing against two baselines (not one) reduces false negatives
// (missing a real fallback) versus a single baseline, at the cost of
// occasionally boxing a glyph that coincidentally shares a baseline's advance
// width. This is a heuristic, not an exact UCD glyph-coverage table — no such
// table is available client-side.
//
// KNOWN LIMITATION (accepted for v1): this heuristic can produce FALSE
// NEGATIVES — wrongly reporting a real, correctly-rendered glyph as
// unsupported (so CharacterMapPane boxes a character the browser actually
// draws fine) — for non-Latin BASE letters on platforms where the CSS
// generic-family keywords (e.g. "monospace"/"serif" below, or "sans-serif"
// generally) resolve to a broad multiscript fallback font. Several Linux
// distros and ChromeOS ship Noto Sans (or a similar pan-Unicode font) as the
// system-wide resolution target for those generic keywords. On such a
// system, the author's chosen font stack and the generic baseline can both
// end up resolving to that same substitution font for a given non-Latin
// character, so the two measureText widths come out identical even though
// the glyph renders correctly — the detector can't distinguish "my font drew
// it" from "the OS quietly substituted the same broad fallback font for
// both comparisons." Combining marks are already exempt from this whole
// path (see CharacterMapPane's isCombiningMark gate — they never call
// isGlyphSupported at all), so this limitation is scoped to non-mark base
// characters only. No fix is planned for v1; flagged here as a documented,
// accepted risk rather than a silent gap.
//
// Hard requirements (all satisfied below):
//   - Degrades to "supported" (show the glyph) wherever real Canvas 2D text
//     metrics are unavailable — jsdom under vitest, SSR, or any environment
//     that lacks a real `canvas` backing (see HTMLCanvasElement.getContext in
//     jsdom, which returns null without the optional `canvas` npm package).
//     Tests and non-browser environments must never box everything out.
//   - Waits for `document.fonts.ready` before measuring, so a web font still
//     loading isn't misread as "missing the glyph" (mid-load, a font stack
//     measures identically to its own generic fallback).
//   - Caches per (fontStack, char) — the grid can render thousands of cells;
//     results must not be remeasured on every render.

// Nested by fontStack, then by char -- avoids relying on any joined-string
// key (which could theoretically collide if fontStack/char text happened to
// embed a chosen delimiter); distinct (fontStack, char) pairs simply can't
// collide because each level of the map is keyed on the value verbatim.
const cache = new Map<string, Map<string, boolean>>();

function getCached(fontStack: string, char: string): boolean | undefined {
  return cache.get(fontStack)?.get(char);
}

function setCached(fontStack: string, char: string, value: boolean): void {
  let perStack = cache.get(fontStack);
  if (perStack === undefined) {
    perStack = new Map<string, boolean>();
    cache.set(fontStack, perStack);
  }
  perStack.set(char, value);
}

// ---------------------------------------------------------------------------
// document.fonts.ready gate — lazily initialized (NOT at module load) so a
// test can install a `document.fonts` polyfill before the first call and
// exercise the "wait for fonts" path; real browsers/jsdom alike only pay this
// cost once, on first use.
// ---------------------------------------------------------------------------

interface FontsApi {
  ready?: Promise<unknown>;
  status?: string;
}

let fontsReadyState: boolean | null = null;
const readySubscribers = new Set<() => void>();

/**
 * Wait for the font set to STOP CHANGING, not merely for the first in-flight
 * batch to finish.
 *
 * `document.fonts.ready` resolves for whatever loads are pending at the moment
 * you read it. Google Fonts serves Noto Sans (our glyph face) as many
 * `unicode-range` subsets that the browser requests LAZILY — only once text
 * needing that range is laid out. So the first `ready` can, and routinely does,
 * resolve before the subset covering a given script has even been requested.
 *
 * Measuring at that point compares a font that has not loaded yet against the
 * generic baseline, concludes "unsupported", and — because the answer is
 * cached — pins a placeholder box onto a character the browser goes on to
 * render perfectly a moment later. That is the "boxes appear and disappear as
 * I move around" behaviour: each re-render re-reads a cache that was populated
 * mid-load.
 *
 * Re-arming while `status === "loading"` means we measure once, after the font
 * set has genuinely settled, and notify subscribers exactly once.
 */
function armReadyGate(fontsApi: FontsApi): void {
  void fontsApi.ready?.then(() => {
    if (fontsApi.status === "loading") {
      armReadyGate(fontsApi);
      return;
    }
    fontsReadyState = true;
    // Copy before iterating: a subscriber may unsubscribe during its own call.
    for (const cb of [...readySubscribers]) cb();
    readySubscribers.clear();
  });
}

function initFontsReadyTracking(): void {
  if (fontsReadyState !== null) return;
  const fontsApi = typeof document === "undefined" ? undefined : (document as { fonts?: FontsApi }).fonts;
  if (fontsApi === undefined || typeof fontsApi.ready?.then !== "function") {
    // No FontFace Loading API at all (SSR, jsdom, older browsers) — nothing
    // to wait for; proceed immediately (real measurement is separately
    // gated by canvas availability below).
    fontsReadyState = true;
    return;
  }
  fontsReadyState = false;
  armReadyGate(fontsApi);
}

function fontsAreReady(): boolean {
  initFontsReadyTracking();
  return fontsReadyState === true;
}

/**
 * Registers `cb` to run once `document.fonts.ready` resolves (immediately,
 * synchronously, if fonts are already ready or the FontFace Loading API isn't
 * present at all). Returns an unsubscribe function. Used by
 * `useFontSupportChecker` to force a re-render once real measurement becomes
 * possible — before that, `isGlyphSupported` returns `true` uncached for
 * every char, so nothing gets re-evaluated without this trigger.
 */
export function onFontsReady(cb: () => void): () => void {
  initFontsReadyTracking();
  if (fontsReadyState) {
    cb();
    return () => {};
  }
  readySubscribers.add(cb);
  return () => {
    readySubscribers.delete(cb);
  };
}

// ---------------------------------------------------------------------------
// Canvas 2D measurement
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      measureCtx = null;
      return measureCtx;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ctx.measureText !== "function") {
      measureCtx = null;
      return measureCtx;
    }
    measureCtx = ctx;
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

/** Generic baseline families compared against the author's chosen font stack. */
const FALLBACK_FAMILIES = ["monospace", "serif"] as const;

const MEASURE_FONT_SIZE = 48;

function measureWidth(ctx: CanvasRenderingContext2D, family: string, text: string): number {
  ctx.font = `${MEASURE_FONT_SIZE}px ${family}`;
  return ctx.measureText(text).width;
}

const WIDTH_EPSILON = 0.01;

/**
 * True when `fontStack` can render `char` with its own glyph, rather than
 * silently falling back to a generic font. `char` may be a multi-codepoint
 * display string (e.g. a dotted-circle-prefixed combining mark) — pass
 * whatever text will actually be rendered on screen, not necessarily a
 * single codepoint.
 *
 * Degrades to `true` (glyph, never a box) whenever real measurement isn't
 * possible: no Canvas 2D context (jsdom/SSR), or fonts not yet loaded.
 */
export function isGlyphSupported(char: string, fontStack: string): boolean {
  if (char === "") return true;
  if (!fontsAreReady()) return true;

  const cached = getCached(fontStack, char);
  if (cached !== undefined) return cached;

  const ctx = getMeasureContext();
  if (ctx === null) {
    setCached(fontStack, char, true);
    return true;
  }

  let supported: boolean;
  try {
    const targetWidth = measureWidth(ctx, fontStack, char);
    supported = !FALLBACK_FAMILIES.some(
      (family) => Math.abs(measureWidth(ctx, family, char) - targetWidth) < WIDTH_EPSILON,
    );
  } catch {
    // Any measurement failure degrades to "supported" — never box a glyph
    // because of a detector error.
    supported = true;
  }

  setCached(fontStack, char, supported);
  return supported;
}
