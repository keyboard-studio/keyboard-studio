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
import { resolveBaseLayout } from "./base-layout.js";
import { deriveScriptFallback, type DeclaredMetadata } from "./fallback.js";
import { SCRIPT_FACET_DEF } from "./__fixtures__/scriptDef.js";

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function buildDesktopKmn(name: string, ruleLines: string[]): string {
  return `store(&VERSION) '10.0'
store(&NAME) '${name}'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

${ruleLines.join("\n")}
`;
}

/** Blocks every letter key with `> nul` except those in `skip`. */
function nulRulesExcept(skip: Set<string>): string[] {
  const rules: string[] = [];
  for (const L of LETTERS) {
    const vk = `K_${L}`;
    if (skip.has(vk)) continue;
    rules.push(`+ [${vk}] > nul`);
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 4 Arabic letters + 1 Latin letter -> Arab is dominant at an 0.8 share.
 * Every other base-layer key is `> nul`-blocked so the spec-040 base-layout
 * fall-through fold contributes nothing here (this fixture tests rule-produced
 * apportionment, not fall-through — see the dedicated spec-040 suite below).
 */
const ARABIC_DOMINANT_KMN = buildDesktopKmn("Test Arabic", [
  `+ [K_A] > U+0627`,
  `+ [K_S] > U+0628`,
  `+ [K_D] > U+062C`,
  `+ [K_F] > U+062F`,
  `+ [K_G] > U+0065`,
  ...nulRulesExcept(new Set(["K_A", "K_S", "K_D", "K_F", "K_G"])),
]);

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
const LATIN_PLUS_SHARED_MARK_KMN = buildDesktopKmn("Test Latin Plus Shared Mark", [
  `+ [K_A] > U+0041`,
  `+ [K_S] > U+0053`,
  `+ [K_D] > U+0301`,
  // Block the rest so the spec-040 fall-through fold adds no leaked Latin here —
  // this fixture isolates the two-pass apportionment of the shared mark.
  ...nulRulesExcept(new Set(["K_A", "K_S", "K_D"])),
]);

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

/** 5 Basic-Latin letters (A-E) — all in the `plain` Latin block. */
const PLAIN_LATIN_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test Plain Latin'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0041
+ [K_S] > U+0042
+ [K_D] > U+0043
+ [K_F] > U+0044
+ [K_G] > U+0045
`;

/** 4 IPA-Extensions letters + 1 plain — IPA share (0.8) clears the Latin floor. */
const IPA_LATIN_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test IPA'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0250
+ [K_S] > U+0251
+ [K_D] > U+0252
+ [K_F] > U+0254
+ [K_G] > U+0041
`;

/** 4 Latin-Extended-A letters + 1 plain — extended share clears the floor, no IPA. */
const EXTENDED_LATIN_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test Extended Latin'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0100
+ [K_S] > U+0101
+ [K_D] > U+0102
+ [K_F] > U+0103
+ [K_G] > U+0041
`;

describe("classifyScript — Latin sub-profile hint (FR-010)", () => {
  it("plain Basic-Latin -> value 'Latn', subProfile.latin 'plain'", () => {
    const { ir } = parse(PLAIN_LATIN_KMN, "test-plain");
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;
    expect(result.value).toBe("Latn");
    expect(result.subProfile).toEqual({ latin: "plain" });
  });

  it("IPA-Extensions letters -> subProfile.latin 'ipa'", () => {
    const { ir } = parse(IPA_LATIN_KMN, "test-ipa");
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;
    expect(result.value).toBe("Latn");
    expect(result.subProfile).toEqual({ latin: "ipa" });
  });

  it("Latin-Extended-A letters -> subProfile.latin 'extended'", () => {
    const { ir } = parse(EXTENDED_LATIN_KMN, "test-extended");
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;
    expect(result.value).toBe("Latn");
    expect(result.subProfile).toEqual({ latin: "extended" });
  });

  it("non-Latin dominant -> no subProfile", () => {
    const { ir } = parse(ARABIC_DOMINANT_KMN, "test-arabic-noprofile");
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;
    expect(result.value).toBe("Arab");
    expect(result.subProfile).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Spec 040 — desktop base-layout fall-through (US1 leak sliver, US2 safety)
// ---------------------------------------------------------------------------

/** Rule lines for the 5 Arabic evidence keys shared by the leak fixtures. */
const ARABIC_EVIDENCE: Record<string, string> = {
  K_S: "U+0627",
  K_D: "U+0628",
  K_F: "U+062C",
  K_G: "U+062F",
  K_H: "U+0631",
};

/**
 * A non-Latin (Arabic) desktop keyboard that remaps 5 keys to Arabic, blocks
 * every other letter key with `> nul`, and leaves ONLY K_A un-named — so the
 * single un-blocked key leaks its kbdus character 'a' as a minor Latn sliver.
 */
const ARABIC_LEAK_KA_KMN = buildDesktopKmn("Arabic leak K_A", [
  ...Object.entries(ARABIC_EVIDENCE).map(([vk, out]) => `+ [${vk}] > ${out}`),
  ...nulRulesExcept(new Set(["K_A", ...Object.keys(ARABIC_EVIDENCE)])),
]);

/**
 * Same as above but with a base-layout branch guard (`baselayout('azerty')`) on
 * K_J — exercises the `notes` `; branches-on: azerty` audit hint. K_J is named
 * by the guarded rule so it does not leak; its Arabic output adds evidence.
 */
const ARABIC_LEAK_WITH_BRANCH_KMN = buildDesktopKmn("Arabic leak with branch", [
  `baselayout('azerty') + [K_J] > U+0632`,
  ...Object.entries(ARABIC_EVIDENCE).map(([vk, out]) => `+ [${vk}] > ${out}`),
  ...nulRulesExcept(new Set(["K_A", "K_J", ...Object.keys(ARABIC_EVIDENCE)])),
]);

/**
 * Same as above but with TWO distinct baselayout('...') guards (azerty on
 * K_J, dvorak on K_K) — exercises the multi-value, sorted `branches-on` note.
 */
const ARABIC_LEAK_WITH_TWO_BRANCHES_KMN = buildDesktopKmn("Arabic leak with two branches", [
  `baselayout('azerty') + [K_J] > U+0632`,
  `baselayout('dvorak') + [K_K] > U+0633`,
  ...Object.entries(ARABIC_EVIDENCE).map(([vk, out]) => `+ [${vk}] > ${out}`),
  ...nulRulesExcept(new Set(["K_A", "K_J", "K_K", ...Object.keys(ARABIC_EVIDENCE)])),
]);

/**
 * An Arabic keyboard that REMAPS K_A to an Arabic char and blocks every other
 * letter key — every base-layer key is named, so nothing leaks (no Latin sliver
 * for K_A or any other key).
 */
const ARABIC_REMAP_KA_NO_LEAK_KMN = buildDesktopKmn("Arabic remap K_A no leak", [
  `+ [K_A] > U+0627`,
  `+ [K_S] > U+0628`,
  ...nulRulesExcept(new Set(["K_A", "K_S"])),
]);

/** Every base-layout key blocked with `> nul` (plus 2 Arabic evidence keys). */
const ALL_NUL_KMN = buildDesktopKmn("All nul", [
  `+ [K_A] > U+0627`,
  `+ [K_S] > U+0628`,
  ...nulRulesExcept(new Set(["K_A", "K_S"])),
]);

describe("classifyScript — desktop base-layout fall-through (spec 040 US1)", () => {
  it("un-blocked K_A leaks a minor Latn distribution entry; dominant stays Arab (AS1)", () => {
    const { ir } = parse(ARABIC_LEAK_KA_KMN, "test-leak-ka");
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;

    expect(result.value).toBe("Arab"); // dominant unchanged by the leak
    expect(result.provenanceTier).toBe("content-derived");
    const dist = result.distribution!;
    expect(dist.Latn).toBeGreaterThan(0); // the leaked sliver is visible
    expect(dist.Arab).toBeGreaterThan(dist.Latn!); // but minor vs the dominant
    // 5 Arabic (rule-produced) + 1 leaked Latin = evidenceSize 6.
    expect(result.evidenceSize).toBe(6);
    const sum = Object.values(dist).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("notes carries `base-layout: kbdus (default)` and appends branches-on when a guard is present (AS2)", () => {
    const plain = classifyScript(parse(ARABIC_LEAK_KA_KMN, "n1").ir, SCRIPT_FACET_DEF)!;
    expect(plain.notes).toBe("base-layout: kbdus (default)");

    const branched = classifyScript(
      parse(ARABIC_LEAK_WITH_BRANCH_KMN, "n2").ir,
      SCRIPT_FACET_DEF,
    )!;
    expect(branched.notes).toBe("base-layout: kbdus (default); branches-on: azerty");
  });

  it("two distinct baselayout guards render comma-joined and sorted in notes (AS2)", () => {
    const { ir } = parse(ARABIC_LEAK_WITH_TWO_BRANCHES_KMN, "n3");
    expect(resolveBaseLayout(ir).branchesOn).toEqual(["azerty", "dvorak"]);
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;
    expect(result.notes).toBe("base-layout: kbdus (default); branches-on: azerty,dvorak");
  });

  it("a keyboard remapping K_A to a non-Latin char adds no leaked Latin for K_A (AS3)", () => {
    const { ir } = parse(ARABIC_REMAP_KA_NO_LEAK_KMN, "test-remap-ka");
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;
    expect(result.value).toBe("Arab");
    // Every base-layer key is named -> no leak at all -> no Latin in the distribution.
    expect(result.distribution!.Latn).toBeUndefined();
  });
});

describe("classifyScript — leak safety guarantees (spec 040 US2)", () => {
  it("an all-`> nul` keyboard produces zero leaked evidence (SC-003, AS1)", () => {
    const { ir } = parse(ALL_NUL_KMN, "test-all-nul");
    const result = classifyScript(ir, SCRIPT_FACET_DEF)!;
    // Only the 2 Arabic rule-produced chars count; no leaked Latin.
    expect(result.evidenceSize).toBe(2);
    expect(result.distribution!.Latn).toBeUndefined();
    expect(result.value).toBe("Arab");
  });

  it("folding the leak never flips the dominant value or worsens confidenceClass (SC-002)", () => {
    // The leak fixture's dominant/confidence must equal the rule-only computation
    // (a fully-blocked variant with the same Arabic evidence, no leak).
    const withLeak = classifyScript(parse(ARABIC_LEAK_KA_KMN, "wl").ir, SCRIPT_FACET_DEF)!;
    const ruleOnly = buildDesktopKmn("Arabic rule only", [
      ...Object.entries(ARABIC_EVIDENCE).map(([vk, out]) => `+ [${vk}] > ${out}`),
      ...nulRulesExcept(new Set(Object.keys(ARABIC_EVIDENCE))), // block K_A too -> no leak
    ]);
    const noLeak = classifyScript(parse(ruleOnly, "nl").ir, SCRIPT_FACET_DEF)!;

    expect(withLeak.value).toBe(noLeak.value);
    expect(withLeak.confidenceClass).toBe(noLeak.confidenceClass);
    expect(noLeak.confidenceClass).toBe("confident"); // 5/5 Arabic, undiluted
  });

  it("a touch-only IR (no base-layer vkey rules) is unaffected — no leak folded (SC-004)", () => {
    const touchOnly = buildDesktopKmn("Touch only", [`+ 'x' > U+0627`]);
    const result = classifyScript(parse(touchOnly, "to").ir, SCRIPT_FACET_DEF)!;
    // One Arabic char, no base-layer surface -> the full-alphabet leak is suppressed.
    expect(result.value).toBe("Arab");
    expect(result.distribution!.Latn).toBeUndefined();
    expect(result.evidenceSize).toBe(1);
    expect(result.notes).toBeUndefined();
  });
});

describe("classifyScript — leak fold determinism (spec 040 US3, SC-005)", () => {
  it("identical (IR, base-layouts.json) inputs yield a deep-equal Categorization", () => {
    const a = classifyScript(parse(ARABIC_LEAK_KA_KMN, "d1").ir, SCRIPT_FACET_DEF);
    const b = classifyScript(parse(ARABIC_LEAK_KA_KMN, "d2").ir, SCRIPT_FACET_DEF);
    expect(b).toEqual(a); // no environment reads, no ordering nondeterminism
  });
});
