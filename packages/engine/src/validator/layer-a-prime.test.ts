/**
 * Tests for Layer A' import-fidelity checks (layer-a-prime.ts).
 *
 * Covers:
 *   I1  checkParseCompleteness  -- clean vs. incomplete parse
 *   I2  checkRoundTrip          -- functional round-trip via simulate() (#882)
 *   I3  checkHeaderPreservation -- missing/empty header fields
 *   I4  checkOpaqueFeatureInventory -- opaque feature counts (non-blocking info)
 *   I5  checkSidecarHash        -- matching vs. mismatched stored hash
 */

import { describe, it, expect, vi } from "vitest";
import {
  checkParseCompleteness,
  checkRoundTrip,
  chordToSimKeyInput,
  ROUND_TRIP_DIVERGENCE_CODE,
  ROUND_TRIP_NO_COVERAGE_CODE,
  ROUND_TRIP_UNAVAILABLE_CODE,
  ROUND_TRIP_CORPUS_TRUNCATED_CODE,
  checkHeaderPreservation,
  checkOpaqueFeatureInventory,
  checkSidecarHash,
  headerFieldLabel,
  HEADER_FIELD_MISSING_CODE,
  checkOwnershipConsistency,
  checkBehaviourNulOnTextContext,
  NUL_ON_TEXT_CONTEXT_CODE,
} from "./layer-a-prime.js";
import type { RoundTripDeps } from "./layer-a-prime.js";
import type { CompileResult, SimKeyInput } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { computeSha256Hex } from "../codec/hash.js";
import { makePattern } from "@keyboard-studio/contracts";
import type { KeyboardIR, IRNodeRef } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CLEAN_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test Keyboard'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2024 SIL'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
+ [K_B] > U+0062
`;

function makeCleanIR(overrides: Partial<KeyboardIR["header"]> = {}): KeyboardIR {
  return makeTestIR({
    header: {
      keyboardId: "test-kb",
      name: "Test Keyboard",
      bcp47: ["en"],
      copyright: "(c) 2024 SIL",
      targets: ["any"],
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// I1 -- Parse completeness
// ---------------------------------------------------------------------------

describe("checkParseCompleteness (I1)", () => {
  it("returns no findings for a clean, fully-parsed keyboard", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = checkParseCompleteness(parseResult, CLEAN_KMN);
    expect(findings).toHaveLength(0);
  });

  it("finding code is KM_ERROR_PARSE_INCOMPLETE when tokens exceed IR nodes", () => {
    // Parse the base KMN, then hand checkParseCompleteness a source that has
    // two extra rule tokens the parser never saw. The heuristic counts source
    // tokens vs IR nodes and reports the difference.
    const parseResult = parse(CLEAN_KMN, "test");
    const extendedSource = CLEAN_KMN + "+ [K_C] > U+0063\n+ [K_D] > U+0064\n";
    const findings = checkParseCompleteness(parseResult, extendedSource);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_PARSE_INCOMPLETE");
  });

  it("finding severity is 'error'", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const extendedSource = CLEAN_KMN + "+ [K_C] > U+0063\n";
    const findings = checkParseCompleteness(parseResult, extendedSource);
    expect(findings[0]?.severity).toBe("error");
  });

  it("finding layer is 'A-prime'", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const extendedSource = CLEAN_KMN + "+ [K_C] > U+0063\n";
    const findings = checkParseCompleteness(parseResult, extendedSource);
    expect(findings[0]?.layer).toBe("A-prime");
  });

  it("finding message mentions dropped token count", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const extendedSource = CLEAN_KMN + "+ [K_C] > U+0063\n";
    const findings = checkParseCompleteness(parseResult, extendedSource);
    expect(findings[0]?.message).toMatch(/1 source token/i);
  });

  it("comment-only additions do not trigger a finding (comments are not data tokens)", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const withExtraComment = CLEAN_KMN + "c this is a comment\nc another comment\n";
    const findings = checkParseCompleteness(parseResult, withExtraComment);
    expect(findings).toHaveLength(0);
  });

  it("begin token counted as at most 1 data token: clean keyboard has no finding", () => {
    const parseResult = parse(CLEAN_KMN, "test");
    const findings = checkParseCompleteness(parseResult, CLEAN_KMN);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// I2 -- Functional round-trip check via simulate() (#882)
// ---------------------------------------------------------------------------

/** IR whose rules reference the given vkeys (drives the D7 corpus). */
function irWithVkeys(...names: string[]): KeyboardIR {
  return {
    ...makeCleanIR(),
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: names.map((name, i) => ({
          nodeId: `r${i}`,
          context: [{ kind: "vkey" as const, name, modifiers: [] }],
          output: [{ kind: "char" as const, value: "x" }],
        })),
      },
    ],
  };
}

function fakeCompiled(side: string): CompileResult {
  return {
    success: true,
    artifacts: [
      {
        filename: "kb.js",
        url: "",
        sizeBytes: 1,
        data: new TextEncoder().encode(side),
      },
    ],
    diagnostics: [],
    compileMs: 0,
    isWarmCompile: true,
  };
}

type FakeSimulate = (side: string, keys: SimKeyInput[]) => string;

/**
 * Fake harness: compileFn tags the artifact with which .kmn text it was
 * given ("original"/"emitted"); simulateFn answers per side via `behaviour`.
 */
function makeFakeDeps(
  behaviour: FakeSimulate = () => "x",
  extra?: Partial<RoundTripDeps>,
): RoundTripDeps {
  return {
    originalKmn: "ORIGINAL_KMN",
    emittedKmn: "EMITTED_KMN",
    keyboardId: "test-kb",
    compileFn: async (vfs, keyboardId) => {
      const kmn = vfs.get(`source/${keyboardId}.kmn`)?.content;
      return fakeCompiled(kmn === "EMITTED_KMN" ? "emitted" : "original");
    },
    simulateFn: (compiled, keys) => {
      const side = new TextDecoder().decode(compiled.artifacts[0]?.data);
      return { finalOutput: behaviour(side, keys), trace: [] };
    },
    ...extra,
  };
}

describe("chordToSimKeyInput (D7 → SimKeyInput bridge)", () => {
  it("maps SHIFT/CTRL/ALT to lowercase simulator modifiers", () => {
    expect(chordToSimKeyInput({ vkey: "K_A", modifiers: ["SHIFT"] })).toEqual({
      vkey: "K_A",
      modifiers: ["shift"],
    });
    expect(chordToSimKeyInput({ vkey: "K_A", modifiers: ["CTRL", "ALT"] })).toEqual({
      vkey: "K_A",
      modifiers: ["ctrl", "alt"],
    });
  });

  it("maps RALT to 'ralt', never 'lalt' (distinct flag bit)", () => {
    expect(chordToSimKeyInput({ vkey: "K_A", modifiers: ["RALT"] })).toEqual({
      vkey: "K_A",
      modifiers: ["ralt"],
    });
  });

  it("maps CAPS to the caps state flag, not a modifier", () => {
    expect(chordToSimKeyInput({ vkey: "K_A", modifiers: ["CAPS"] })).toEqual({
      vkey: "K_A",
      modifiers: [],
      caps: true,
    });
  });

  it("returns null for an unmapped modifier name (coverage gap, never guessed)", () => {
    expect(chordToSimKeyInput({ vkey: "K_A", modifiers: ["HYPER"] })).toBeNull();
  });
});

describe("checkRoundTrip (I2 functional)", () => {
  const ir = irWithVkeys("K_A");

  it("without deps, reports UNAVAILABLE (hint) — never a silent pass", async () => {
    const findings = await checkRoundTrip(ir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(ROUND_TRIP_UNAVAILABLE_CODE);
    expect(findings[0]?.severity).toBe("hint");
    expect(findings[0]?.layer).toBe("A-prime");
  });

  it("equivalent keyboards produce NO findings", async () => {
    const findings = await checkRoundTrip(ir, makeFakeDeps());
    expect(findings).toHaveLength(0);
  });

  it("divergence produces ONE aggregate error with counts and an example", async () => {
    const deps = makeFakeDeps((side, keys) =>
      side === "emitted" && keys.length === 1 && keys[0]?.vkey === "K_A" && keys[0]?.modifiers.length === 0
        ? "z"
        : "x",
    );
    const findings = await checkRoundTrip(ir, deps);
    const errors = findings.filter((f) => f.code === ROUND_TRIP_DIVERGENCE_CODE);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.severity).toBe("error");
    expect(errors[0]?.message).toMatch(/of 24 compared input\(s\)/);
    expect(errors[0]?.message).toContain("[K_A]");
  });

  it("empty corpus → NO_COVERAGE warning, and compile is never attempted", async () => {
    const compileFn = vi.fn(async () => fakeCompiled("original"));
    const deps = makeFakeDeps(() => "x", { compileFn });
    const findings = await checkRoundTrip({ ...makeCleanIR(), groups: [] }, deps);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(ROUND_TRIP_NO_COVERAGE_CODE);
    expect(findings[0]?.severity).toBe("warning");
    expect(compileFn).not.toHaveBeenCalled();
  });

  it("compile failure on either side → UNAVAILABLE hint naming the diagnostic", async () => {
    const deps = makeFakeDeps(() => "x", {
      compileFn: async (vfs, keyboardId) => {
        const kmn = vfs.get(`source/${keyboardId}.kmn`)?.content;
        if (kmn === "EMITTED_KMN") {
          return {
            success: false,
            artifacts: [],
            diagnostics: [
              { code: "KM_X", severity: "error" as const, layer: "A" as const, message: "boom-diagnostic" },
            ],
            compileMs: 0,
            isWarmCompile: true,
          };
        }
        return fakeCompiled("original");
      },
    });
    const findings = await checkRoundTrip(ir, deps);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(ROUND_TRIP_UNAVAILABLE_CODE);
    expect(findings[0]?.message).toContain("boom-diagnostic");
  });

  it("missing .js artifact → UNAVAILABLE hint", async () => {
    const deps = makeFakeDeps(() => "x", {
      compileFn: async () => ({
        success: true,
        artifacts: [{ filename: "kb.kmx", url: "", sizeBytes: 1 }],
        diagnostics: [],
        compileMs: 0,
        isWarmCompile: true,
      }),
    });
    const findings = await checkRoundTrip(ir, deps);
    expect(findings[0]?.code).toBe(ROUND_TRIP_UNAVAILABLE_CODE);
    expect(findings[0]?.message).toContain("no .js artifact");
  });

  it("simulate throwing on BOTH sides → UNAVAILABLE hint, not divergence", async () => {
    const deps = makeFakeDeps(() => "x", {
      simulateFn: () => {
        throw new Error("runtime exploded");
      },
    });
    const findings = await checkRoundTrip(ir, deps);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(ROUND_TRIP_UNAVAILABLE_CODE);
  });

  it("simulate throwing on ONE side only → divergence error", async () => {
    const deps = makeFakeDeps(() => "x", {
      simulateFn: (compiled) => {
        const side = new TextDecoder().decode(compiled.artifacts[0]?.data);
        if (side === "emitted") throw new Error("emitted runtime exploded");
        return { finalOutput: "x", trace: [] };
      },
    });
    const findings = await checkRoundTrip(ir, deps);
    const errors = findings.filter((f) => f.code === ROUND_TRIP_DIVERGENCE_CODE);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("simulate threw");
  });

  it("sibling files populate BOTH compile VFSes; only the .kmn differs", async () => {
    const seen: Array<{ kmn: unknown; ico: unknown }> = [];
    const deps = makeFakeDeps(() => "x", {
      sourceFiles: [
        { path: "source/test-kb.ico", content: new Uint8Array([1, 2, 3]), isBinary: true },
        // A stale .kmn in sourceFiles must be overridden by original/emitted.
        { path: "source/test-kb.kmn", content: "STALE", isBinary: false },
      ],
      compileFn: async (vfs, keyboardId) => {
        seen.push({
          kmn: vfs.get(`source/${keyboardId}.kmn`)?.content,
          ico: vfs.get("source/test-kb.ico")?.content,
        });
        const kmn = vfs.get(`source/${keyboardId}.kmn`)?.content;
        return fakeCompiled(kmn === "EMITTED_KMN" ? "emitted" : "original");
      },
    });
    const findings = await checkRoundTrip(ir, deps);
    expect(findings).toHaveLength(0);
    expect(seen.map((s) => s.kmn)).toEqual(["ORIGINAL_KMN", "EMITTED_KMN"]);
    expect(seen.every((s) => s.ico instanceof Uint8Array)).toBe(true);
  });

  it("truncated corpus → TRUNCATED warning naming generated vs theoretical counts", async () => {
    const manyVkeys = irWithVkeys(
      "K_A", "K_B", "K_C", "K_D", "K_E", "K_F", "K_G", "K_H", "K_I", "K_J", "K_K", "K_L",
    );
    const findings = await checkRoundTrip(manyVkeys, makeFakeDeps());
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(ROUND_TRIP_CORPUS_TRUNCATED_CODE);
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.message).toContain("100000");
    expect(findings[0]?.message).toContain("135720");
  }, 60_000);

  it("logs corpus info including the [layer-a-prime] prefix and vkey count", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await checkRoundTrip(irWithVkeys("K_A"));
    const firstArg = infoSpy.mock.calls[0]?.[0] as string;
    expect(firstArg).toContain("[layer-a-prime] I2 corpus:");
    expect(firstArg).toContain("1 vkeys");
    infoSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// I3 -- Header preservation
// ALL tests skipped due to BUG in layer-a-prime.ts:115
// ---------------------------------------------------------------------------

describe("checkHeaderPreservation (I3)", () => {
  const EMITTED_WITH_ALL_HEADERS = [
    "store(&VERSION) '10.0'",
    "store(&NAME) 'Test Keyboard'",
    "store(&COPYRIGHT) '(c) 2024 SIL'",
    "store(&KEYBOARDVERSION) '1.0'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "",
    "+ [K_A] > 'a'",
  ].join("\n");

  it("no finding when emitted has all stores populated", () => {
    const ir = makeCleanIR();
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    expect(findings).toHaveLength(0);
  });

  it("KM_WARN_HEADER_FIELD_MISSING when keyboardId is empty", () => {
    const ir = makeCleanIR({ keyboardId: "" });
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    const kbFinding = findings.find((f) => f.message.includes("keyboardId"));
    expect(kbFinding).toBeDefined();
    expect(kbFinding?.code).toBe("KM_WARN_HEADER_FIELD_MISSING");
    expect(kbFinding?.severity).toBe("warning");
    expect(kbFinding?.layer).toBe("A-prime");
  });

  it("KM_WARN_HEADER_FIELD_MISSING when keyboardId is whitespace-only", () => {
    const ir = makeCleanIR({ keyboardId: "   " });
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    expect(findings.find((f) => f.message.includes("keyboardId"))).toBeDefined();
  });

  it("no bcp47 finding when bcp47 is empty array", () => {
    // Language tags live in the package descriptor, not the .kmn, and the
    // parser leaves header.bcp47 empty until the survey identity composes
    // it — I3 must not report it. With every real .kmn store populated,
    // an empty bcp47 yields no findings at all.
    const ir = makeCleanIR({ bcp47: [] });
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    expect(findings.find((f) => f.message.includes("bcp47"))).toBeUndefined();
    expect(findings).toHaveLength(0);
  });

  it("no bcp47 finding when all bcp47 entries are blank", () => {
    const ir = makeCleanIR({ bcp47: ["", "  "] });
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    expect(findings.find((f) => f.message.includes("bcp47"))).toBeUndefined();
    expect(findings).toHaveLength(0);
  });

  it("no bcp47 finding when bcp47 has at least one non-empty tag", () => {
    const ir = makeCleanIR({ bcp47: ["en"] });
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    expect(findings.find((f) => f.message.includes("bcp47"))).toBeUndefined();
  });

  it("KM_WARN_HEADER_FIELD_MISSING when NAME store absent", () => {
    const ir = makeCleanIR();
    const emittedNoName = "store(&VERSION) '10.0'\nstore(&KEYBOARDVERSION) '1.0'\n";
    const findings = checkHeaderPreservation(ir, emittedNoName);
    expect(findings.find((f) => f.message.includes("&NAME"))).toBeDefined();
  });

  it("differing-but-non-empty NAME does not trigger a finding", () => {
    // Identity propagation is intentional per spec; only emptiness is checked.
    const ir = makeCleanIR({ name: "Original Name" });
    const emittedDifferentName = [
      "store(&NAME) 'Adapted Name'",
      "store(&COPYRIGHT) '(c) 2024 SIL'",
      "store(&KEYBOARDVERSION) '1.0'",
    ].join("\n");
    const findings = checkHeaderPreservation(ir, emittedDifferentName);
    expect(findings.find((f) => f.message.includes("&NAME"))).toBeUndefined();
  });

  it("KM_WARN_HEADER_FIELD_MISSING when COPYRIGHT absent", () => {
    const ir = makeCleanIR();
    const emitted = "store(&NAME) 'Test'\nstore(&KEYBOARDVERSION) '1.0'\n";
    const findings = checkHeaderPreservation(ir, emitted);
    expect(findings.find((f) => f.message.includes("copyright"))).toBeDefined();
  });

  it("KM_WARN_HEADER_FIELD_MISSING when KEYBOARDVERSION absent", () => {
    const ir = makeCleanIR();
    const emitted = "store(&NAME) 'Test'\nstore(&COPYRIGHT) '(c)'\n";
    const findings = checkHeaderPreservation(ir, emitted);
    expect(findings.find((f) => f.message.includes("version"))).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// headerFieldLabel — extractor lock-test
//
// The supportability scanner derives its i3HeaderMissing column from this
// extractor. The lock-test pins the round-trip (message -> label) so a reword
// of checkHeaderPreservation's "missing" message breaks HERE, loudly, instead
// of silently degrading the scanner's output to raw message prose.
// ---------------------------------------------------------------------------

describe("headerFieldLabel (I3 extractor)", () => {
  it("recovers every field label emitted by checkHeaderPreservation", () => {
    // Drive the real check with everything missing (empty IR header + empty
    // emitted text), then confirm each finding's label round-trips.
    const ir = makeCleanIR({ keyboardId: "" });
    const findings = checkHeaderPreservation(ir, "");
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.code).toBe(HEADER_FIELD_MISSING_CODE);
      const label = headerFieldLabel(f);
      // Must extract a non-null label, and it must actually appear in the message.
      expect(label).not.toBeNull();
      expect(f.message).toContain(`"${label}"`);
    }
    // The known label set is recovered intact. There is no bcp47 label:
    // language tags are not a .kmn header field and I3 does not check them.
    const labels = findings.map(headerFieldLabel);
    expect(labels).toContain("keyboardId");
    expect(labels).toContain("name (&NAME)");
    expect(labels).not.toContain("bcp47 (language tags)");
    expect(labels).toContain("copyright (&COPYRIGHT)");
    expect(labels).toContain("version (&KEYBOARDVERSION / &VERSION)");
  });

  it("returns null for a finding that is not a header-field-missing one", () => {
    expect(
      headerFieldLabel({
        code: "KM_HINT_ROUND_TRIP_UNAVAILABLE",
        severity: "hint",
        layer: "A-prime",
        message: "Functional round-trip (I2) could not run: ...",
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// I4 -- Opaque feature inventory
// ---------------------------------------------------------------------------

describe("checkOpaqueFeatureInventory (I4)", () => {
  it("always emits exactly one finding regardless of opaque count", () => {
    const cleanResult = parse(CLEAN_KMN, "test");
    expect(checkOpaqueFeatureInventory(cleanResult)).toHaveLength(1);
  });

  it("finding code is KM_INFO_OPAQUE_FEATURE_INVENTORY", () => {
    const cleanResult = parse(CLEAN_KMN, "test");
    const findings = checkOpaqueFeatureInventory(cleanResult);
    expect(findings[0]?.code).toBe("KM_INFO_OPAQUE_FEATURE_INVENTORY");
  });

  it("finding severity is 'info' (non-blocking)", () => {
    const cleanResult = parse(CLEAN_KMN, "test");
    expect(checkOpaqueFeatureInventory(cleanResult)[0]?.severity).toBe("info");
  });

  it("finding layer is 'A-prime'", () => {
    const cleanResult = parse(CLEAN_KMN, "test");
    expect(checkOpaqueFeatureInventory(cleanResult)[0]?.layer).toBe("A-prime");
  });

  it("message says 'No opaque fragments' when the keyboard is clean", () => {
    const cleanResult = parse(CLEAN_KMN, "test");
    const msg = checkOpaqueFeatureInventory(cleanResult)[0]?.message ?? "";
    expect(msg).toContain("No opaque fragments");
  });

  it("message lists feature names with counts for an opaque keyboard", () => {
    const OPAQUE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Opaque KB'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c)'
store(&KEYBOARDVERSION) '1.0'
store(myFlag) 'x'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
+ [K_B] > save(myFlag, 1)
`;
    const opaqueResult = parse(OPAQUE_KMN, "opaque-test");
    const msg = checkOpaqueFeatureInventory(opaqueResult)[0]?.message ?? "";
    expect(msg).toMatch(/option-store-directive/);
    // The message uses the unicode multiplication sign: "option-store-directive×1"
    expect(msg).toMatch(/\xd7\d+/);
  });

  it("total count in message reflects the sum of all feature counts", () => {
    const OPAQUE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Multi Opaque'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c)'
store(&KEYBOARDVERSION) '1.0'
store(myFlag) 'x'

begin Unicode > use(main)

group(main) using keys

+ [K_B] > save(myFlag, 1)
+ [K_C] > outs(myFlag)
`;
    const opaqueResult = parse(OPAQUE_KMN, "multi-opaque");
    const total = opaqueResult.opaqueFeatures.reduce((s, f) => s + f.count, 0);
    const msg = checkOpaqueFeatureInventory(opaqueResult)[0]?.message ?? "";
    expect(msg).toContain(`${total} raw fragment`);
  });
});

// ---------------------------------------------------------------------------
// I5 -- Sidecar hash
// ---------------------------------------------------------------------------

describe("checkSidecarHash (I5)", () => {
  const SIDECAR_TEXT = "c imported keyboard\nstore(&VERSION) '10.0'\n";

  it("returns no findings when stored hash matches recomputed hash", async () => {
    const hash = await computeSha256Hex(SIDECAR_TEXT);
    const findings = await checkSidecarHash("test-kb", SIDECAR_TEXT, hash);
    expect(findings).toHaveLength(0);
  });

  it("returns KM_ERROR_SIDECAR_HASH_MISMATCH when hashes differ", async () => {
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const findings = await checkSidecarHash("test-kb", SIDECAR_TEXT, staleHash);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_SIDECAR_HASH_MISMATCH");
  });

  it("mismatch finding severity is 'error'", async () => {
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const findings = await checkSidecarHash("test-kb", SIDECAR_TEXT, staleHash);
    expect(findings[0]?.severity).toBe("error");
  });

  it("mismatch finding layer is 'A-prime'", async () => {
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const findings = await checkSidecarHash("test-kb", SIDECAR_TEXT, staleHash);
    expect(findings[0]?.layer).toBe("A-prime");
  });

  it("mismatch finding message includes both stored and recomputed hashes", async () => {
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const findings = await checkSidecarHash("test-kb", SIDECAR_TEXT, staleHash);
    const recomputed = await computeSha256Hex(SIDECAR_TEXT);
    expect(findings[0]?.message).toContain(staleHash);
    expect(findings[0]?.message).toContain(recomputed);
  });

  it("mismatch finding message includes the keyboardId", async () => {
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const findings = await checkSidecarHash("my-keyboard", SIDECAR_TEXT, staleHash);
    expect(findings[0]?.message).toContain("my-keyboard");
  });

  it("mutating a single character in the sidecar text triggers a mismatch", async () => {
    const originalHash = await computeSha256Hex(SIDECAR_TEXT);
    const mutatedText = SIDECAR_TEXT.replace("10.0", "10.1");
    const findings = await checkSidecarHash("test-kb", mutatedText, originalHash);
    expect(findings[0]?.code).toBe("KM_ERROR_SIDECAR_HASH_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// I6 -- Ownership consistency
// ---------------------------------------------------------------------------

describe("checkOwnershipConsistency (I6)", () => {
  // Build an IR with one group holding `rules` plus `patterns` in recognizedPatterns.
  function irWith(
    rules: Array<{ nodeId: string; ownedByPattern?: string }>,
    patterns: Array<{ id: string; ownedNodes?: IRNodeRef[] }>,
  ): KeyboardIR {
    return {
      ...makeCleanIR(),
      groups: [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: rules.map((r) => ({
            nodeId: r.nodeId,
            context: [{ kind: "vkey" as const, name: "K_A", modifiers: [] }],
            output: [{ kind: "char" as const, value: "a" }],
            ...(r.ownedByPattern !== undefined ? { ownedByPattern: r.ownedByPattern } : {}),
          })),
        },
      ],
      recognizedPatterns: patterns.map((p) =>
        makePattern({
          id: p.id,
          title: "x",
          description: "x",
          category: "desktop",
          appliesTo: [],
          questions: [],
          kmnFragment: "",
          tests: [],
          validatedForFamilies: [],
          sourceKeyboards: [],
          reviewedBy: "test",
          reviewDate: "2026-06-02",
          origin: "recognized",
          ...(p.ownedNodes !== undefined ? { ownedNodes: p.ownedNodes } : {}),
        }),
      ),
    };
  }

  it("passes when Pattern.ownedNodes and rule.ownedByPattern agree", () => {
    const ir = irWith(
      [{ nodeId: "r1", ownedByPattern: "P1" }],
      [{ id: "P1", ownedNodes: [{ kind: "rule", nodeId: "r1" }] }],
    );
    expect(checkOwnershipConsistency(ir)).toHaveLength(0);
  });

  it("passes for a keyboard with no recognized patterns and no owned nodes", () => {
    expect(checkOwnershipConsistency(irWith([{ nodeId: "r1" }], []))).toHaveLength(0);
  });

  it("errors (forward mismatch) when the owned rule's ownedByPattern names a different Pattern", () => {
    // "OTHER" is a real Pattern here so the reverse orphan-check stays clean and
    // this isolates the forward mismatch (P1 owns r1, but r1 says OTHER).
    const ir = irWith(
      [{ nodeId: "r1", ownedByPattern: "OTHER" }],
      [
        { id: "P1", ownedNodes: [{ kind: "rule", nodeId: "r1" }] },
        { id: "OTHER" },
      ],
    );
    const f = checkOwnershipConsistency(ir);
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe("KM_ERROR_OWNERSHIP_CONSISTENCY");
    expect(f[0]?.severity).toBe("error");
    expect(f[0]?.layer).toBe("A-prime");
    expect(f[0]?.message).toContain('expected "P1"');
  });

  it("errors (forward mismatch) when the owned rule has no ownedByPattern at all (unset)", () => {
    // The most common real-world cause: the recognizer set Pattern.ownedNodes
    // but never wrote back-references onto the rules. Distinct message sub-branch.
    const ir = irWith(
      [{ nodeId: "r1" }],
      [{ id: "P1", ownedNodes: [{ kind: "rule", nodeId: "r1" }] }],
    );
    const f = checkOwnershipConsistency(ir);
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe("KM_ERROR_OWNERSHIP_CONSISTENCY");
    expect(f[0]?.message).toContain("unset");
    expect(f[0]?.message).toContain('expected "P1"');
  });

  it("errors when Pattern.ownedNodes points to a rule that no longer exists (stale pointer)", () => {
    const ir = irWith([], [{ id: "P1", ownedNodes: [{ kind: "rule", nodeId: "gone" }] }]);
    const f = checkOwnershipConsistency(ir);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("no such rule exists");
  });

  it("errors (orphaned node) when a rule is owned by a Pattern that was deleted", () => {
    const ir = irWith([{ nodeId: "r1", ownedByPattern: "DELETED" }], []);
    const f = checkOwnershipConsistency(ir);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("orphaned node");
  });

  it("ignores non-rule ownedNodes refs (only rules carry ownedByPattern)", () => {
    const ir = irWith(
      [{ nodeId: "r1", ownedByPattern: "P1" }],
      [{ id: "P1", ownedNodes: [{ kind: "rule", nodeId: "r1" }, { kind: "store", nodeId: "s1" }] }],
    );
    expect(checkOwnershipConsistency(ir)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// I6 extension — behaviour-owned nul on a text-bearing context (076 FR-020)
// ---------------------------------------------------------------------------

describe("checkBehaviourNulOnTextContext", () => {
  /** Parse one rule line; optionally stamp it as suppression-owned. */
  function ruleIr(line: string, owned: boolean): KeyboardIR {
    const { ir } = parse(`begin Unicode > use(main)

group(main) using keys
${line}
`, "t");
    const rule = ir.groups[0]!.rules[0]!;
    expect(rule, `fixture must parse to a typed rule: ${line}`).toBeDefined();
    if (!owned) return ir;
    return {
      ...ir,
      groups: [{ ...ir.groups[0]!, rules: [{ ...rule, ownedByBehaviour: "carve-suppression" }] }],
    };
  }

  it.each([
    ["a quoted-text context", "'x' + [K_A] > nul"],
    ["nul beep on a text context", "'x' + [K_A] > nul beep"],
    ["a mixed text-plus-deadkey context", "'x' dk(1) + [K_A] > nul"],
  ])("flags a behaviour-owned nul on %s", (_label, line) => {
    const findings = checkBehaviourNulOnTextContext(ruleIr(line, true));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ code: NUL_ON_TEXT_CONTEXT_CODE, severity: "error" });
  });

  it.each([
    ["a bare-key rule", "+ [K_A] > nul"],
    ["a deadkey-only context", "dk(1) + [K_A] > nul"],
    ["loud deadkey-only suppression", "dk(1) + [K_A] > nul beep"],
    ["a text context re-emitted with context", "'x' + [K_A] > context"],
  ])("accepts a behaviour-owned rule on %s", (_label, line) => {
    expect(checkBehaviourNulOnTextContext(ruleIr(line, true))).toEqual([]);
  });

  it("ignores hand-written nul on a text context (sil_yoruba8 backspace idiom)", () => {
    expect(checkBehaviourNulOnTextContext(ruleIr("'gb' + [K_BKSP] > nul", false))).toEqual([]);
  });
});
