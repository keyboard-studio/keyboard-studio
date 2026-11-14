import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS, type CompileResult } from "@keyboard-studio/contracts";
import { compile, mapKmnCompilerEvent } from "./index.js";
import { loadKmcMessageTables } from "./kmcMessages.js";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (keyboardId: string) =>
  readFileSync(resolve(here, "__fixtures__", `${keyboardId}.kmn`), "utf8");
const minimalKmn = readFixture("minimal");

// Fixtures that must compile clean through kmc-kmn. Each is compiled once and
// the assertions share the result.
//   - minimal: the smallest compilable keyboard.
//   - nfd_latin_demo: the nfd-latin reorder pattern's demo skeleton (issue
//     #40). The pattern's demo.filled_kmn is mirrored verbatim into this
//     fixture so the canonical mark-reorder block is proven to compile clean.
describe.each(["minimal", "nfd_latin_demo"])("compile() — kmc-kmn pipeline against %s.kmn fixture", (keyboardId) => {
  let result: CompileResult;

  beforeAll(async () => {
    const vfs = createVirtualFS([
      { path: `source/${keyboardId}.kmn`, content: readFixture(keyboardId), isBinary: false },
    ]);
    result = await compile(vfs, keyboardId);
  }, 30_000);

  it("produces a non-empty .kmx artifact", () => {
    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);
  });

  it("emits no error- or fatal-severity diagnostics", () => {
    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Oracle-pinning: empty-store guard evidence (packages/engine/src/pattern-apply/
// applyStoreSlotRemovals.ts). These two tests pin the exact kmcmplib behavior
// that justifies that transform's refusal guard, against the real in-repo
// kmcmplib WASM (not a mock):
//
//   (i)  An empty store DECLARATION (`store(name)`, zero value tokens) is
//        legal on its own — it compiles to a valid .kmx with no error/fatal
//        diagnostics when the store is unreferenced.
//   (ii) The SAME empty store consumed by any() in a rule
//        (`+ any(name) > 'x'`) fails with kmcmplib's error-severity "A string
//        of zero characters was found" (ERROR_ZeroLengthString, 0x502017) on
//        the rule line and produces NO .kmx artifact at all. (This read as a
//        "silent" warning-level failure until compile() decoded kmcmplib's
//        severity from the message code.)
//
// If either of these regresses (e.g. a kmcmplib upgrade starts rejecting
// case (i), or starts emitting a .kmx for case (ii)), the refusal guard's
// premise needs re-deriving — treat a failure here as a signal to revisit
// applyStoreSlotRemovals's drop-class empty-store handling, not just a test
// fixture to patch.
// ---------------------------------------------------------------------------

describe("compile() — oracle pinning for the empty-store guard (#523)", () => {
  it("an unreferenced empty store declaration compiles to a .kmx artifact with no error/fatal diagnostics", async () => {
    const kmnWithEmptyStore = minimalKmn + "\nstore(emptyProbe)\n";
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: kmnWithEmptyStore, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  }, 30_000);

  it("an empty store consumed by any() produces NO .kmx artifact, with an error diagnostic on the rule line", async () => {
    const kmnWithAnyOfEmptyStore =
      minimalKmn +
      [
        "",
        "store(emptyProbe)",
        "group(probe) using keys",
        "+ any(emptyProbe) > 'x'",
        "",
      ].join("\n");
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: kmnWithAnyOfEmptyStore, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeUndefined();
    expect(result.success).toBe(false);

    const ruleLine = kmnWithAnyOfEmptyStore.split("\n").indexOf("+ any(emptyProbe) > 'x'") + 1;
    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([
      expect.objectContaining({
        code: `KM_ERROR_KMCMP_${0x502017}`,
        severity: "error",
        message: expect.stringMatching(/zero characters/i),
        location: expect.objectContaining({ line: ruleLine }),
      }),
    ]);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Oracle-pinning: SMP characters inside a system-store string literal
// (#1811 residual AC). The store emitter bundles SMP chars (> U+FFFF) into
// system-store strings (packages/engine/src/codec/emit.ts, isStringSafeChar
// metadata branch) on the strength of this check: the real kmcmplib WASM
// compiles each form below with success, a .kmx artifact, and ZERO
// diagnostics of any severity. If a future kmcmplib upgrade starts
// rejecting or warning on these forms, these tests fail and the emitter
// comment's recorded verdict must be revisited.
// ---------------------------------------------------------------------------

describe("compile() — oracle pinning for SMP in system stores (#1811)", () => {
  const cases: Array<[string, string]> = [
    ["multi-SMP + ASCII in one literal", "'𑜠𑜡x'"],
    ["lone SMP string", "'𑜠'"],
    ["mixed BMP + SMP + combining mark", "'A𑜠̀z'"],
  ];
  it.each(cases)("&NAME %s compiles clean through kmc-kmn", async (_label, nameValue) => {
    const kmn = minimalKmn.replace("'Minimal'", nameValue);
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: kmn, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");
    expect(result.success).toBe(true);
    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual([]);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Severity + location decode (regression). kmc-kmn's CompilerEvent has no
// `severity` field — severity is bit-packed into the numeric `code` — and it
// names the line field `line`, not `lineNumber`. compile() used to read both
// absent fields, so every kmcmplib error arrived as severity "warning"
// (`KM_WARNING_KMCMP_<code>`) with no location, and a "no error/fatal
// diagnostics" assertion (like the one above) could never catch one.
// ---------------------------------------------------------------------------

describe("compile() — kmcmplib severity and line decode", () => {
  it("labels a kmcmplib error as severity 'error' with its .kmn line", async () => {
    // Line 7 references a store that is never declared: kmcmplib's
    // ERROR_StoreDoesNotExist (SevError | KmnCompiler | 0x01D = 0x50201D).
    const failingKmn = [
      "store(&NAME) 'Severity Probe'",
      "store(&VERSION) '10.0'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "",
      "group(main) using keys",
      "+ [K_A] > index(nosuch, 1)",
      "",
    ].join("\n");
    const vfs = createVirtualFS([
      { path: "source/probe.kmn", content: failingKmn, isBinary: false },
    ]);
    const result = await compile(vfs, "probe");

    expect(result.success).toBe(false);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: `KM_ERROR_KMCMP_${0x50201d}`,
      severity: "error",
      layer: "A",
      location: { line: 7 },
    });
    expect(errors[0]?.location?.file).toMatch(/probe\.kmn$/);
    expect(result.diagnostics.some((d) => d.code.startsWith("KM_WARNING_"))).toBe(false);
  }, 30_000);

  it("decodes every CompilerErrorSeverity band from the code's severity bits", async () => {
    const tables = await loadKmcMessageTables();
    const base = 0x2000 | 0x01d; // KmnCompiler namespace | base code
    expect(tables.severity(0x000000 | base)).toBe("info"); // Debug
    expect(tables.severity(0x100000 | base)).toBe("info"); // Verbose
    expect(tables.severity(0x200000 | base)).toBe("info");
    expect(tables.severity(0x300000 | base)).toBe("hint");
    expect(tables.severity(0x400000 | base)).toBe("warning");
    expect(tables.severity(0x500000 | base)).toBe("error");
    expect(tables.severity(0x600000 | base)).toBe("fatal");
    // Symbolic names come from kmc-kmn's own message tables.
    expect(tables.name(0x50201d)).toBe("ERROR_StoreDoesNotExist");
    expect(tables.name(0x3020ae)).toBe("HINT_UnreachableRule");
    expect(tables.name(0x507004)).toBe("ERROR_TouchLayoutFileDoesNotExist"); // KmwCompiler namespace
    expect(tables.name(0x5020ff)).toBeUndefined();
  });

  it("tags each diagnostic with its compile-target platform (#2378)", async () => {
    const tables = await loadKmcMessageTables();
    // The name lookups pin every numeric code below to its upstream symbol,
    // so a hand-computed code that drifts names the wrong message — and the
    // length assertion pins the size of the web set, so an upstream rename
    // that drops a code out of WEB_ONLY_KMN_MESSAGE_NAMES fails here
    // instead of silently re-tagging it "desktop".
    const webOnly: Array<[number, string]> = [
      // KmwCompiler namespace (0x7000).
      [0x507004, "ERROR_TouchLayoutFileDoesNotExist"],
      [0x207006, "INFO_MinimumWebEngineVersion"],
      // Web-only KmnCompiler codes (WEB_ONLY_KMN_MESSAGE_NAMES).
      [0x502063, "ERROR_140FeatureOnlyContextAndNotAnyWeb"],
      [0x502059, "ERROR_InvalidTouchLayoutFile"],
      [0x502054, "ERROR_NotSupportedInKeymanWebContext"],
      [0x502055, "ERROR_NotSupportedInKeymanWebOutput"],
      [0x502056, "ERROR_NotSupportedInKeymanWebStore"],
      [0x50205a, "ERROR_TouchLayoutInvalidIdentifier"],
      [0x502057, "ERROR_VirtualCharacterKeysNotSupportedInKeymanWeb"],
      [0x402098, "WARN_ExtendedShiftFlagsNotSupportedInKeymanWeb"],
      [0x402092, "WARN_TouchLayoutCustomKeyNotDefined"],
      [0x40209f, "WARN_TouchLayoutFontShouldBeSameForAllPlatforms"],
      [0x402091, "WARN_TouchLayoutMissingLayer"],
      [0x402093, "WARN_TouchLayoutMissingRequiredKeys"],
      [0x4020a9, "WARN_TouchLayoutSpecialLabelOnNormalKey"],
      [0x402099, "WARN_TouchLayoutUnidentifiedKey"],
      [0x402095, "WARN_EmbedJsFileMissing"],
      [0x50200b, "ERROR_InvalidBegin"],
      [0x402094, "WARN_HelpFileMissing"],
      [0x502058, "ERROR_VirtualKeysNotValidForMnemonicLayouts"],
      [0x4020a3, "WARN_DontMixChiralAndNonChiralModifiers"],
      [0x30209a, "HINT_UnreachableKeyCode"],
      [0x50205b, "ERROR_InvalidKeyCode"],
      [0x4020aa, "WARN_OptionStoreNameInvalid"],
    ];
    expect(webOnly).toHaveLength(24);
    for (const [code, name] of webOnly) {
      expect(tables.name(code)).toBe(name);
      expect(tables.platform(code)).toBe("web");
    }

    // Shared .kmn rules (both passes) stay "desktop" — including the
    // version-gate codes, which name web-only features but the shared WASM
    // parser enforces on both passes (ERROR_90FeatureOnlyEmbedCSS and
    // ERROR_90FeatureOnlyLayoutFile), and codes that fire on both passes
    // (WARN_VirtualKeyWithMnemonicLayout, WARN_KeyBadLength).
    const desktop: Array<[number, string]> = [
      [0x50201d, "ERROR_StoreDoesNotExist"],
      [0x3020ae, "HINT_UnreachableRule"],
      [0x502060, "ERROR_90FeatureOnlyEmbedCSS"],
      [0x50205c, "ERROR_90FeatureOnlyLayoutFile"],
      [0x40208b, "WARN_VirtualKeyWithMnemonicLayout"],
      [0x402084, "WARN_KeyBadLength"],
    ];
    for (const [code, name] of desktop) {
      expect(tables.name(code)).toBe(name);
      expect(tables.platform(code)).toBe("desktop");
    }
    // An unknown KmnCompiler-namespace code defaults to desktop (it is a
    // .kmn code until proven otherwise); any other namespace stays unowned.
    expect(tables.name(0x5020ff)).toBeUndefined();
    expect(tables.platform(0x5020ff)).toBe("desktop");
    expect(tables.platform(0x401000)).toBeUndefined();

    // The tag rides on the mapped diagnostic; a non-numeric code has no
    // namespace to decode and stays untagged.
    expect(mapKmnCompilerEvent({ code: 0x507004, message: "t" }, "k", tables).platform).toBe("web");
    expect(mapKmnCompilerEvent({ code: 0x4020a3, message: "w" }, "k", tables).platform).toBe("web");
    expect(mapKmnCompilerEvent({ code: 0x50201d, message: "d" }, "k", tables).platform).toBe("desktop");
    expect(mapKmnCompilerEvent({ code: 0x502060, message: "e" }, "k", tables).platform).toBe("desktop");
    expect(
      mapKmnCompilerEvent({ code: "ERROR_Something", message: "x" }, "k", tables),
    ).not.toHaveProperty("platform");
  });

  it("platform tagging follows the targets pass: a web-pass-only warning is 'web' under targets=any and absent under targets=windows (#2378)", async () => {
    // Mixing chiral and non-chiral Ctrl sets is accepted by the desktop
    // pass; only the web pass reports
    // WARN_DontMixChiralAndNonChiralModifiers ("Use only one or the other
    // set for web target"). Compiling the same keyboard with
    // targets=windows skips the web pass entirely, so it must produce no
    // web-tagged diagnostic at all. What this control catches is the
    // opposite mistake: a code wrongly tagged "web" that fires on the
    // desktop pass, or a web pass running under targets=windows. (A code
    // missed from the web set is tagged "desktop" and shows in the
    // desktop pane — visible, not dropped — so this test cannot catch
    // that direction; only the emission-proven set in kmcMessages.ts
    // guards it.)
    const chiralKmn = (targets: string) =>
      minimalKmn.replace("'any'", `'${targets}'`) +
      "\n+ [LCTRL K_A] > 'x'\n+ [CTRL K_B] > 'y'\n";
    const compileTargets = async (targets: string) => {
      const vfs = createVirtualFS([
        { path: "source/minimal.kmn", content: chiralKmn(targets), isBinary: false },
      ]);
      return compile(vfs, "minimal");
    };

    const anyResult = await compileTargets("any");
    expect(anyResult.artifacts.some((a) => a.filename.endsWith(".js"))).toBe(true);
    const webWarning = anyResult.diagnostics.find(
      (d) => d.code === `KM_WARN_KMCMP_${0x4020a3}`,
    );
    expect(webWarning).toMatchObject({ severity: "warning", platform: "web" });

    const windowsResult = await compileTargets("windows");
    expect(windowsResult.artifacts.some((a) => a.filename.endsWith(".js"))).toBe(false);
    expect(windowsResult.diagnostics.filter((d) => d.platform === "web")).toEqual([]);
    expect(
      windowsResult.diagnostics.some((d) => d.code === `KM_WARN_KMCMP_${0x4020a3}`),
    ).toBe(false);
  }, 30_000);

  it("maps the CompilerEvent shape: severity-derived code prefix, `line`, filename fallback", async () => {
    const tables = await loadKmcMessageTables();
    // Non-numeric codes keep the old "warning" fallback.
    expect(mapKmnCompilerEvent({ code: "ERROR_Something", message: "x" }, "k", tables).severity).toBe("warning");
    expect(
      mapKmnCompilerEvent({ code: 0x4020a3, message: "w", line: 3 }, "source/k.kmn", tables),
    ).toEqual({
      code: `KM_WARN_KMCMP_${0x4020a3}`,
      severity: "warning",
      layer: "A",
      message: "w",
      platform: "web",
      location: { file: "source/k.kmn", line: 3 },
    });
    expect(
      mapKmnCompilerEvent(
        { code: 0x600000 | 0x2001, message: "f", filename: "source/other.kmn", line: 9 },
        "source/k.kmn",
        tables,
      ),
    ).toMatchObject({ severity: "fatal", location: { file: "source/other.kmn", line: 9 } });
    // No line → no location (kmc-kmn's own messages, e.g. Error_FileNotFound).
    expect(mapKmnCompilerEvent({ code: 0x50290c, message: "e" }, "source/k.kmn", tables)).not.toHaveProperty(
      "location",
    );
  });
});

// ---------------------------------------------------------------------------
// Release vs debug build. kmc-kmn defaults saveDebug to true, which ships store
// names, a TSS_DEBUG_LINE store per group and source line numbers in the .kmx,
// and a pretty-printed .js with `// Line N` comments. The output path (the .kmp
// and the source zip's build/) passes saveDebug: false so a shipped package
// matches what Keyman Developer builds; the live preview keeps the default.
// ---------------------------------------------------------------------------
describe("compile() — saveDebug", () => {
  const kmn =
    "store(&VERSION) '14.0'\n" +
    "store(&NAME) 'Debug probe'\n" +
    "store(&TARGETS) 'any'\n" +
    "begin Unicode > use(main)\n" +
    "group(main) using keys\n" +
    "'a' + 'a' > 'ä'\n" +
    "+ [K_Q] > 'q'\n";
  const build = (opts?: { saveDebug?: boolean }) =>
    compile(createVirtualFS([{ path: "source/dbg.kmn", content: kmn, isBinary: false }]), "dbg", opts);

  async function debugMarkers(result: CompileResult): Promise<{ debugLineStores: number; jsLineComments: boolean }> {
    const { KmxFileReader, KMX } = await import("@keymanapp/common-types");
    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"))?.data;
    const js = result.artifacts.find((a) => a.filename.endsWith(".js"))?.data;
    expect(kmx).toBeDefined();
    expect(js).toBeDefined();
    const kb = new KmxFileReader().read(kmx!);
    return {
      debugLineStores: kb.stores.filter((s) => s.dwSystemID === KMX.KMXFile.TSS_DEBUG_LINE).length,
      jsLineComments: /\/\/ Line \d+/.test(new TextDecoder().decode(js!)),
    };
  }

  it("saveDebug: false produces a release .kmx and .js", async () => {
    const markers = await debugMarkers(await build({ saveDebug: false }));
    expect(markers).toEqual({ debugLineStores: 0, jsLineComments: false });
  }, 30_000);

  it("the default (the live preview) still carries debug data", async () => {
    const markers = await debugMarkers(await build());
    expect(markers.debugLineStores).toBeGreaterThan(0);
    expect(markers.jsLineComments).toBe(true);
  }, 30_000);
});
