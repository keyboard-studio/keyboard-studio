/**
 * Script-classifier unit tests (spec 036 T011, US1 acceptance 1-2; FR-003/004/010).
 *
 * Written tests-first against the pinned interface:
 *   classifyScript(ir: KeyboardIR, def: FacetDefinition): Categorization | null
 * `script-classifier.ts` does not exist yet (T015) — these tests are expected
 * to fail to resolve until it lands.
 *
 * Fixture IRs are built with the real codec (`parse()`), per house convention
 * (prefer building IRs via parse() over hand-constructing them). Each fixture
 * is a minimal-but-real .kmn: header stores + one `group(main) using keys`
 * with a handful of `+ [K_x] > U+XXXX` rules, mirroring
 * packages/engine/src/codec/parse.test.ts's MINIMAL_KMN shape.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyScript } from "./script-classifier.js";
import { deriveScriptFallback, type DeclaredMetadata } from "./fallback.js";
import { SCRIPT_FACET_DEF } from "./__fixtures__/scriptDef.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** 4 Arabic letters + 1 Latin letter -> Arab is dominant at an 0.8 share. */
const ARABIC_DOMINANT_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test Arabic'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0627
+ [K_S] > U+0628
+ [K_D] > U+062C
+ [K_F] > U+062F
+ [K_G] > U+0065
`;

/**
 * Only Common (U+0020 SPACE) and Inherited (U+0301 COMBINING ACUTE ACCENT,
 * script-extends nothing concrete) output. No concretely-scripted character
 * exists anywhere in the produced set, so the classifier must not invent a
 * dominant script by diluting toward whichever script happens to appear
 * first — it must recognize there is nothing to classify.
 */
const NEUTRAL_ONLY_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test Neutral'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_SPACE] > U+0020
+ [K_A] > U+0301
`;

/** Syntactically broken .kmn: `parse()` must throw (no usable IR). */
const UNPARSEABLE_KMN = "group(main using keys\n+ [K_A] > ???\n";

/**
 * 2 exclusive Latin letters (U+0041, U+0053) attest Latn in pass 1, plus one
 * shared character (U+0301 COMBINING ACUTE ACCENT — Script_Extensions names
 * 8 scripts including Latn, but not exclusively Latin) that pass 2 must
 * apportion to Latn because Latn is the only one of those 8 already
 * attested. Locks the two-pass apportionment fix (spec 036 linguist
 * correction): a shared character is no longer dropped just because its
 * extension set names more than one script — it strengthens whichever
 * attested script(s) it intersects.
 */
const LATIN_PLUS_SHARED_MARK_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test Latin Plus Shared Mark'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0041
+ [K_S] > U+0053
+ [K_D] > U+0301
`;

describe("classifyScript", () => {
  it("Arabic-dominant produced set -> value 'Arab', distribution dominant on Arab, content-derived tier", () => {
    const { ir } = parse(ARABIC_DOMINANT_KMN, "test-arabic");
    const result = classifyScript(ir, SCRIPT_FACET_DEF);

    expect(result).not.toBeNull();
    const categorization = result!;
    expect(categorization.value).toBe("Arab");
    expect(categorization.provenanceTier).toBe("content-derived");
    expect(categorization.analysisOutcome).toBe("fully");

    // Distribution sums to ~1 and Arab is strictly the largest share (dominant).
    const dist = categorization.distribution;
    expect(dist).toBeDefined();
    const sum = Object.values(dist!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(dist!.Arab).toBeGreaterThan(0.5);
    for (const [script, share] of Object.entries(dist!)) {
      if (script !== "Arab") expect(dist!.Arab).toBeGreaterThan(share);
    }
    // 4 of 5 produced characters are Arabic -> ~0.8 share.
    expect(dist!.Arab).toBeCloseTo(0.8, 1);
  });

  it("Common/Inherited-only produced set -> null (no concretely-scripted output, no dilution)", () => {
    const { ir } = parse(NEUTRAL_ONLY_KMN, "test-neutral");
    const result = classifyScript(ir, SCRIPT_FACET_DEF);
    expect(result).toBeNull();
  });

  it("shared character (Script_Extensions naming multiple scripts) apportions to the attested script it intersects, rather than staying neutral", () => {
    const { ir } = parse(LATIN_PLUS_SHARED_MARK_KMN, "test-latin-plus-shared-mark");
    const result = classifyScript(ir, SCRIPT_FACET_DEF);

    expect(result).not.toBeNull();
    const categorization = result!;
    // All 3 characters resolve to Latn: 2 exclusive + 1 apportioned share.
    expect(categorization.value).toBe("Latn");
    expect(categorization.evidenceSize).toBe(3);
    expect(categorization.distribution).toEqual({ Latn: 1 });
  });

  it("parse() throws on malformed .kmn, routing the build to the fallback chain rather than classifyScript", () => {
    // classifyScript takes a KeyboardIR; when the source cannot be parsed at
    // all there is no IR to hand it. The build orchestrator (T018) wraps only
    // parse() in try/catch and falls back to deriveScriptFallback (T017) for
    // this keyboard instead of calling classifyScript. This test documents
    // that routing decision at the parse boundary.
    expect(() => parse(UNPARSEABLE_KMN, "broken")).toThrow();
  });
});

describe("deriveScriptFallback (the unparseable-keyboard / no-content-analysis path)", () => {
  it("declared-metadata tier: a keyboard whose .kps declares a script directly", () => {
    const meta: DeclaredMetadata = { bcp47Tags: ["ar"], declaredScript: "Arab" };
    const result = deriveScriptFallback(meta, SCRIPT_FACET_DEF);

    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).toBe("declared-metadata");
    expect(result.provenanceTier).not.toBe("content-derived");
    expect(result.value).toBe("Arab");
  });

  it("default-fallback tier: no declared script, derived from the declared BCP47 language's default script", () => {
    const meta: DeclaredMetadata = { bcp47Tags: ["ar"], declaredScript: null };
    const result = deriveScriptFallback(meta, SCRIPT_FACET_DEF);

    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.value).toBe("Arab");
  });

  it("never reports the content-derived tier — that tier requires classifyScript, not the fallback chain", () => {
    const meta: DeclaredMetadata = { bcp47Tags: [], declaredScript: null };
    const result = deriveScriptFallback(meta, SCRIPT_FACET_DEF);
    expect(result.provenanceTier).not.toBe("content-derived");
    expect(result.analysisOutcome).toBe("fallback-only");
  });

  it("out-of-limits declared script (e.g. a pseudo-code) falls through to the next tier rather than being emitted", () => {
    // "Zzzz" is not in SCRIPT_FACET_DEF.limits.values, so tier 1 must reject it
    // and fall through to tier 2, which resolves "ar"'s langtags default script.
    const meta: DeclaredMetadata = { bcp47Tags: ["ar"], declaredScript: "Zzzz" };
    const result = deriveScriptFallback(meta, SCRIPT_FACET_DEF);

    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.provenanceTier).not.toBe("declared-metadata");
    expect(result.value).toBe("Arab");
  });
});
