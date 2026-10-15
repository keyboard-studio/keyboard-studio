// Tests for scriptFonts.ts — the script→face registry, session script
// resolution, stack composition, and the on-demand FontFace loader behind
// the ready gate fontSupport consults.
//
// Loader tests use vi.resetModules() + dynamic import per test (the load
// state map is a module singleton) and stub the FontFace constructor +
// document.fonts, which jsdom does not provide.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { LanguageDefaults } from "@keyboard-studio/contracts";
import {
  SCRIPT_FONT_REGISTRY,
  appendScriptFamilies,
  scriptFontCovering,
  scriptFontCovers,
  scriptFontForScript,
  unicodeRangeOf,
} from "./scriptFonts.ts";

// ---------------------------------------------------------------------------
// Registry shape (pure — no module reset needed)
// ---------------------------------------------------------------------------

describe("scriptFonts — registry", () => {
  it("carries exactly the four Pick 1 scripts in registry order", () => {
    expect(SCRIPT_FONT_REGISTRY.map((d) => d.script)).toEqual(["Arab", "Ethi", "Syrc", "Tibt"]);
    expect(SCRIPT_FONT_REGISTRY.map((d) => d.family)).toEqual([
      "Noto Naskh Arabic",
      "Noto Sans Ethiopic",
      "Noto Sans Syriac",
      "Noto Serif Tibetan",
    ]);
  });

  it("every probe is a character the face's own ranges cover", () => {
    for (const def of SCRIPT_FONT_REGISTRY) {
      const cp = def.probe.codePointAt(0);
      expect(cp).toBeDefined();
      expect(scriptFontCovers(def, cp!)).toBe(true);
    }
  });

  it("vendored file names follow the public/fonts naming pattern", () => {
    for (const def of SCRIPT_FONT_REGISTRY) {
      expect(def.file).toMatch(/^[a-z0-9-]+-400-[a-z]+\.woff2$/);
    }
  });

  it("scriptFontCovering keys on the first codepoint", () => {
    expect(scriptFontCovering("ا")?.script).toBe("Arab");
    expect(scriptFontCovering("ሀ")?.script).toBe("Ethi");
    expect(scriptFontCovering("ܐ")?.script).toBe("Syrc");
    expect(scriptFontCovering("ཀ")?.script).toBe("Tibt");
    expect(scriptFontCovering("a")).toBeUndefined();
    expect(scriptFontCovering("")).toBeUndefined();
  });

  it("unicodeRangeOf renders the CSS descriptor from the same ranges", () => {
    expect(unicodeRangeOf(scriptFontForScript("Tibt")!)).toBe(
      "U+0F00-0FFF, U+200C-200D, U+25CC, U+3008-300B",
    );
    expect(unicodeRangeOf(scriptFontForScript("Arab")!)).toContain("U+0600-06FF");
  });
});

// ---------------------------------------------------------------------------
// Session script resolution (pure)
// ---------------------------------------------------------------------------

const DEFAULTS: Record<string, LanguageDefaults> = {
  ar: { code: "ar", defaultScript: "Arab", regions: [] },
  am: { code: "am", defaultScript: "Ethi", regions: [] },
  syr: { code: "syr", defaultScript: "Syrc", regions: [] },
  bo: { code: "bo", defaultScript: "Tibt", regions: [] },
  en: { code: "en", defaultScript: "Latn", regions: [] },
};
const accessor = (subtag: string) => DEFAULTS[subtag.toLowerCase()] ?? null;

describe("scriptFonts — resolveSessionScripts", () => {
  it("resolves the target language's script from the langtags default", async () => {
    const { resolveSessionScripts } = await import("./scriptFonts.ts");
    expect(resolveSessionScripts("ar", [], accessor)).toEqual(["Arab"]);
  });

  it("an explicit script subtag in the target tag wins without langtags", async () => {
    const { resolveSessionScripts } = await import("./scriptFonts.ts");
    expect(resolveSessionScripts("ewo-Arab", [], () => null)).toEqual(["Arab"]);
  });

  it("unions target + base language-tag scripts, in registry order", async () => {
    const { resolveSessionScripts } = await import("./scriptFonts.ts");
    // Discovery order here is Tibt (target) then Arab (base); the result
    // must be registry order (Arab before Tibt) for a stable stack string.
    expect(resolveSessionScripts("bo", ["ar", "am"], accessor)).toEqual(["Arab", "Ethi", "Tibt"]);
  });

  it("includes the base's declared primary script when it declares no languages", async () => {
    const { resolveSessionScripts } = await import("./scriptFonts.ts");
    expect(resolveSessionScripts("en", [], accessor, "Syrc")).toEqual(["Syrc"]);
  });

  it("contributes nothing for covered scripts, unknown languages, or empty input", async () => {
    const { resolveSessionScripts } = await import("./scriptFonts.ts");
    expect(resolveSessionScripts("en", ["en"], accessor)).toEqual([]);
    expect(resolveSessionScripts("xx", [], accessor)).toEqual([]);
    expect(resolveSessionScripts("", [], accessor)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Stack composition (pure)
// ---------------------------------------------------------------------------

describe("scriptFonts — appendScriptFamilies", () => {
  it("inserts script families before the trailing generic family", () => {
    expect(appendScriptFamilies("'Noto Sans', system-ui, sans-serif", ["Arab"])).toBe(
      "'Noto Sans', system-ui, 'Noto Naskh Arabic', sans-serif",
    );
    expect(appendScriptFamilies("'Charis SIL', serif", ["Tibt"])).toBe(
      "'Charis SIL', 'Noto Serif Tibetan', serif",
    );
  });

  it("orders multiple families by the registry, not the input order", () => {
    expect(appendScriptFamilies("'Andika', sans-serif", ["Tibt", "Arab"])).toBe(
      "'Andika', 'Noto Naskh Arabic', 'Noto Serif Tibetan', sans-serif",
    );
  });

  it("is a no-op for empty or faceless script lists", () => {
    const stack = "'Noto Sans', system-ui, sans-serif";
    expect(appendScriptFamilies(stack, [])).toBe(stack);
    expect(appendScriptFamilies(stack, ["Deva"])).toBe(stack);
  });
});

// ---------------------------------------------------------------------------
// Loader + ready gate (stubbed FontFace API, fresh module per test)
// ---------------------------------------------------------------------------

class FakeFontFace {
  static instances: FakeFontFace[] = [];
  family: string;
  source: string;
  descriptors: Record<string, string>;

  constructor(family: string, source: string, descriptors: Record<string, string>) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    FakeFontFace.instances.push(this);
  }
}

/** Fake FontFaceSet: records add() calls and load(font, text) triggers;
 * each load returns a promise the test settles explicitly. Tests here load
 * one script at a time, so a single pending slot suffices. */
class FakeFontsSet {
  added: FakeFontFace[] = [];
  loadCalls: { font: string; text?: string }[] = [];
  private resolveLoad!: (faces: unknown[]) => void;
  private rejectLoad!: (err: unknown) => void;

  add(face: FakeFontFace): void {
    this.added.push(face);
  }

  load(font: string, text?: string): Promise<unknown[]> {
    this.loadCalls.push({ font, text });
    return new Promise<unknown[]>((resolve, reject) => {
      this.resolveLoad = resolve;
      this.rejectLoad = reject;
    });
  }

  settleLoaded(): void {
    this.resolveLoad([FakeFontFace.instances[FakeFontFace.instances.length - 1]]);
  }

  settleFailed(): void {
    this.rejectLoad(new Error("load failed"));
  }
}

function installFakeFontFaceApi(): { fontsSet: FakeFontsSet } {
  FakeFontFace.instances = [];
  const fontsSet = new FakeFontsSet();
  vi.stubGlobal("FontFace", FakeFontFace);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: fontsSet,
  });
  return { fontsSet };
}

const ARAB_STACK = "'Noto Sans', system-ui, 'Noto Naskh Arabic', sans-serif";

describe("scriptFonts — loader and ready gate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "fonts");
  });

  it("injects a FontFace for the vendored file and actively loads it with the probe", async () => {
    const { fontsSet } = installFakeFontFaceApi();
    const sf = await import("./scriptFonts.ts");

    sf.ensureScriptFontsLoaded(["Arab"]);

    expect(FakeFontFace.instances).toHaveLength(1);
    const face = FakeFontFace.instances[0]!;
    expect(face.family).toBe("Noto Naskh Arabic");
    expect(face.source).toBe('url("/fonts/noto-naskh-arabic-400-arabic.woff2") format("woff2")');
    expect(face.descriptors.unicodeRange).toContain("U+0600-06FF");
    expect(fontsSet.added).toEqual([face]);
    // The load is actively triggered with a probe from the script's range —
    // not left to lazy layout.
    expect(fontsSet.loadCalls).toEqual([{ font: '16px "Noto Naskh Arabic"', text: "ا" }]);
    expect(sf.getScriptFontLoadState("Arab")).toBe("loading");
  });

  it("is idempotent per script and ignores scripts without a registry face", async () => {
    installFakeFontFaceApi();
    const sf = await import("./scriptFonts.ts");
    sf.ensureScriptFontsLoaded(["Arab", "Deva"]);
    sf.ensureScriptFontsLoaded(["Arab"]);
    expect(FakeFontFace.instances).toHaveLength(1);
    expect(sf.getScriptFontLoadState("Deva")).toBe("idle");
  });

  it("gates measurement while pending, settles to loaded, and notifies subscribers", async () => {
    const { fontsSet } = installFakeFontFaceApi();
    const sf = await import("./scriptFonts.ts");
    const settled: string[] = [];
    sf.onScriptFontsChanged((script) => settled.push(script));

    sf.ensureScriptFontsLoaded(["Arab"]);
    expect(sf.pendingScriptFontFor("ا", ARAB_STACK)?.script).toBe("Arab");

    fontsSet.settleLoaded();
    await Promise.resolve();
    await Promise.resolve();

    expect(sf.getScriptFontLoadState("Arab")).toBe("loaded");
    expect(settled).toEqual(["Arab"]);
    expect(sf.pendingScriptFontFor("ا", ARAB_STACK)).toBeUndefined();
  });

  it("a failed load is terminal: state failed, subscribers notified, gate opens", async () => {
    const { fontsSet } = installFakeFontFaceApi();
    const sf = await import("./scriptFonts.ts");
    const settled: string[] = [];
    sf.onScriptFontsChanged((script) => settled.push(script));

    sf.ensureScriptFontsLoaded(["Syrc"]);
    fontsSet.settleFailed();
    await Promise.resolve();
    await Promise.resolve();

    expect(sf.getScriptFontLoadState("Syrc")).toBe("failed");
    expect(settled).toEqual(["Syrc"]);
    expect(
      sf.pendingScriptFontFor("ܐ", "'Noto Sans', 'Noto Sans Syriac', sans-serif"),
    ).toBeUndefined();
  });

  it("does not gate characters whose stack does not name the family", async () => {
    installFakeFontFaceApi();
    const sf = await import("./scriptFonts.ts");
    sf.ensureScriptFontsLoaded(["Arab"]);
    expect(sf.pendingScriptFontFor("ا", "'Noto Sans', sans-serif")).toBeUndefined();
    expect(sf.pendingScriptFontFor("a", ARAB_STACK)).toBeUndefined();
  });

  it("self-triggers the load when a covered character meets an idle face", async () => {
    installFakeFontFaceApi();
    const sf = await import("./scriptFonts.ts");
    expect(sf.getScriptFontLoadState("Tibt")).toBe("idle");
    expect(sf.pendingScriptFontFor("ཀ", "'Noto Sans', 'Noto Serif Tibetan', sans-serif")?.script).toBe(
      "Tibt",
    );
    expect(sf.getScriptFontLoadState("Tibt")).toBe("loading");
    expect(FakeFontFace.instances).toHaveLength(1);
  });

  it("degrades to unavailable with no FontFace API (jsdom/SSR): no gate, no throw", async () => {
    const sf = await import("./scriptFonts.ts");
    sf.ensureScriptFontsLoaded(["Arab"]);
    expect(sf.getScriptFontLoadState("Arab")).toBe("unavailable");
    expect(sf.pendingScriptFontFor("ا", ARAB_STACK)).toBeUndefined();
  });
});
