// Tests for fontSupport.ts — the per-glyph font-support detector backing
// CharacterMapPane's deterministic box fallback (Requirement 1).
//
// vi.resetModules() + dynamic import per test isolates the module's
// lazily-initialized document.fonts.ready state and its measurement cache,
// since both are module-scope singletons computed once on first use.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// A minimal fake CanvasRenderingContext2D — tracks the last `font` assigned
// and returns a caller-controlled width per (font, text) pair, so the
// width-comparison logic can be exercised deterministically (real jsdom has
// no canvas backing at all — see the "degrades gracefully" tests below for
// that path).
// ---------------------------------------------------------------------------

function makeFakeCtx(widthOf: (font: string, text: string) => number) {
  let currentFont = "";
  return {
    set font(v: string) {
      currentFont = v;
    },
    get font() {
      return currentFont;
    },
    measureText: (text: string) => ({ width: widthOf(currentFont, text) }),
  } as unknown as CanvasRenderingContext2D;
}

/** Installs a fake HTMLCanvasElement.getContext returning `ctx` for "2d". */
function installFakeCanvas(ctx: CanvasRenderingContext2D | null): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((id: string) =>
    id === "2d" ? ctx : null) as typeof HTMLCanvasElement.prototype.getContext);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fontSupport — degrades gracefully with no real Canvas 2D metrics (jsdom/SSR)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("isGlyphSupported returns true (glyph, never a box) when getContext yields no usable context — real jsdom has no `canvas` package installed", async () => {
    const { isGlyphSupported } = await import("./fontSupport.ts");
    // jsdom's own HTMLCanvasElement.getContext already returns null here
    // (no `canvas` npm package in this workspace) — no mock needed, this is
    // the actual environment vitest runs in.
    expect(isGlyphSupported("a", "'Noto Sans', system-ui, sans-serif")).toBe(true);
    expect(isGlyphSupported("̀", "'Noto Sans', system-ui, sans-serif")).toBe(true);
  });

  it("treats the empty string as supported (no-op guard)", async () => {
    const { isGlyphSupported } = await import("./fontSupport.ts");
    expect(isGlyphSupported("", "'Noto Sans', system-ui, sans-serif")).toBe(true);
  });

  it("a measureText that throws degrades to supported rather than propagating", async () => {
    installFakeCanvas({
      measureText: () => {
        throw new Error("boom");
      },
      set font(_v: string) {},
    } as unknown as CanvasRenderingContext2D);
    const { isGlyphSupported } = await import("./fontSupport.ts");
    expect(isGlyphSupported("a", "'Noto Sans', system-ui, sans-serif")).toBe(true);
  });
});

describe("fontSupport — real-measurement comparison logic (fake canvas context)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reports supported when the target font stack's width differs from both generic baselines", async () => {
    const ctx = makeFakeCtx((font) => {
      if (font.includes("Noto Sans")) return 30; // distinct glyph width
      if (font.includes("monospace")) return 20;
      if (font.includes("serif")) return 22;
      return 10;
    });
    installFakeCanvas(ctx);
    const { isGlyphSupported } = await import("./fontSupport.ts");
    expect(isGlyphSupported("a", "'Noto Sans', system-ui, sans-serif")).toBe(true);
  });

  it("reports UNSUPPORTED when the target stack's width matches either generic baseline (font fell back to a generic face)", async () => {
    const ctx = makeFakeCtx((font) => {
      if (font.includes("Charis SIL")) return 20; // matches monospace exactly -> fallback
      if (font.includes("monospace")) return 20;
      if (font.includes("serif")) return 22;
      return 10;
    });
    installFakeCanvas(ctx);
    const { isGlyphSupported } = await import("./fontSupport.ts");
    expect(isGlyphSupported("𞤀", "'Charis SIL', serif")).toBe(false);
  });

  it("caches per (fontStack, char) — a second call for the same pair does not re-invoke getContext", async () => {
    let getContextCalls = 0;
    const ctx = makeFakeCtx(() => 30);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((id: string) => {
      if (id === "2d") getContextCalls++;
      return id === "2d" ? ctx : null;
    }) as typeof HTMLCanvasElement.prototype.getContext);
    const { isGlyphSupported } = await import("./fontSupport.ts");

    isGlyphSupported("a", "'Noto Sans', system-ui, sans-serif");
    isGlyphSupported("a", "'Noto Sans', system-ui, sans-serif");
    isGlyphSupported("a", "'Noto Sans', system-ui, sans-serif");

    expect(getContextCalls).toBe(1);
  });

  it("does not share cache entries across different font stacks for the same char", async () => {
    const ctx = makeFakeCtx((font) => {
      // "Noto Sans" gets its own glyph; "Charis SIL" falls back to monospace.
      if (font.includes("Noto Sans")) return 30;
      if (font.includes("Charis SIL")) return 20;
      if (font.includes("monospace")) return 20;
      if (font.includes("serif")) return 22;
      return 10;
    });
    installFakeCanvas(ctx);
    const { isGlyphSupported } = await import("./fontSupport.ts");

    expect(isGlyphSupported("𞤀", "'Noto Sans', system-ui, sans-serif")).toBe(true);
    expect(isGlyphSupported("𞤀", "'Charis SIL', serif")).toBe(false);
  });

  it("measures the Andika stack independently from the other font stacks", async () => {
    const ctx = makeFakeCtx((font) => {
      if (font.includes("Andika")) return 28; // distinct glyph width
      if (font.includes("monospace")) return 20;
      if (font.includes("serif")) return 22;
      return 10;
    });
    installFakeCanvas(ctx);
    const { isGlyphSupported } = await import("./fontSupport.ts");

    expect(isGlyphSupported("a", "'Andika', sans-serif")).toBe(true);
    expect(isGlyphSupported("𞤀", "'Andika', sans-serif")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Script-face ready gate — a vendored script face (scriptFonts.ts) that is
// still loading must defer measurement of characters in its range, and the
// deferred answer must NOT be cached: once the face settles, the same call
// measures for real.
// ---------------------------------------------------------------------------

class GateFakeFontFace {
  constructor(
    public family: string,
    public source: string,
    public descriptors: Record<string, string>,
  ) {}
}

/** Settles the pending FontFaceSet.load() promise installed by the gate
 * environment below — assigned per install, called by the test when the
 * face should "arrive". */
let settleGateLoad: (() => void) | null = null;

const ARAB_STACK = "'Noto Sans', system-ui, 'Noto Naskh Arabic', sans-serif";

describe("fontSupport — script-face ready gate", () => {
  beforeEach(() => {
    vi.resetModules();
    settleGateLoad = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "fonts");
  });

  function installGateEnvironment(): void {
    // Widths make the Arabic char measure as UNSUPPORTED whenever a real
    // measurement happens: the target stack falls back to the monospace
    // baseline width exactly.
    const ctx = makeFakeCtx((font) => {
      if (font.includes("monospace")) return 20;
      if (font.includes("Noto Naskh Arabic")) return 20;
      if (font.includes("serif")) return 22;
      return 10;
    });
    installFakeCanvas(ctx);
    vi.stubGlobal("FontFace", GateFakeFontFace);
    // document.fonts WITHOUT `ready`: fontSupport's own fonts-ready gate
    // latches "ready" immediately, isolating the script-face gate under test.
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        add: () => {},
        load: () =>
          new Promise<unknown[]>((resolve) => {
            settleGateLoad = () => resolve([{}]);
          }),
      },
    });
  }

  it("defers measurement while the covering face loads, then measures for real after it settles (deferred answer is not cached)", async () => {
    installGateEnvironment();
    const { isGlyphSupported } = await import("./fontSupport.ts");
    const scriptFonts = await import("./scriptFonts.ts");

    scriptFonts.ensureScriptFontsLoaded(["Arab"]);
    expect(scriptFonts.getScriptFontLoadState("Arab")).toBe("loading");

    // While pending: reported supported (glyph shown), and crucially NOT
    // measured — a measurement now would conclude "unsupported".
    expect(isGlyphSupported("ا", ARAB_STACK)).toBe(true);

    expect(settleGateLoad).not.toBeNull();
    settleGateLoad!();
    await Promise.resolve();
    await Promise.resolve();
    expect(scriptFonts.getScriptFontLoadState("Arab")).toBe("loaded");

    // After settle: the real measurement runs and its answer wins — proof
    // the deferred `true` above never entered the cache.
    expect(isGlyphSupported("ا", ARAB_STACK)).toBe(false);
  });

  it("does not gate a character whose stack does not name the script family", async () => {
    // Counting canvas: if the gate (wrongly) applied to this stack, no
    // measurement would happen at all and the count would stay 0. Widths
    // differ per family so a real measurement concludes "supported".
    let measureCalls = 0;
    const ctx = makeFakeCtx((font) => {
      measureCalls++;
      if (font.includes("monospace")) return 20;
      // "Noto Sans" before "serif": the stack text "sans-serif" itself
      // contains the substring "serif".
      if (font.includes("Noto Sans")) return 30;
      if (font.includes("serif")) return 22;
      return 10;
    });
    installFakeCanvas(ctx);
    vi.stubGlobal("FontFace", GateFakeFontFace);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      // load() never settles: the face stays "loading" for this whole test.
      value: { add: () => {}, load: () => new Promise<unknown[]>(() => {}) },
    });
    const { isGlyphSupported } = await import("./fontSupport.ts");
    const scriptFonts = await import("./scriptFonts.ts");

    scriptFonts.ensureScriptFontsLoaded(["Arab"]);
    expect(scriptFonts.getScriptFontLoadState("Arab")).toBe("loading");
    expect(scriptFonts.pendingScriptFontFor("ا", "'Noto Sans', sans-serif")).toBeUndefined();
    expect(isGlyphSupported("ا", "'Noto Sans', sans-serif")).toBe(true);
    expect(measureCalls).toBeGreaterThan(0);
  });
});

describe("fontSupport — onFontsReady", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls back synchronously when the FontFace Loading API isn't present at all (jsdom has no document.fonts)", async () => {
    const { onFontsReady } = await import("./fontSupport.ts");
    let called = false;
    onFontsReady(() => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("waits for document.fonts.ready before calling back, when the API is present", async () => {
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: readyPromise },
    });

    const { onFontsReady } = await import("./fontSupport.ts");
    let called = false;
    onFontsReady(() => {
      called = true;
    });
    expect(called).toBe(false);

    resolveReady();
    await readyPromise;
    // Allow the .then() microtask queued inside onFontsReady to flush.
    await Promise.resolve();
    expect(called).toBe(true);

    // Clean up the defineProperty so it doesn't leak into later test files.
    Reflect.deleteProperty(document, "fonts");
  });
});
