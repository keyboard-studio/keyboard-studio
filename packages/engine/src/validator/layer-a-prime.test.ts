/**
 * Tests for Layer A' import-fidelity checks (layer-a-prime.ts).
 *
 * Covers:
 *   I1  checkParseCompleteness  -- clean vs. incomplete parse
 *   I2  checkRoundTrip          -- deferred stub (hint, no RoundTripDivergence)
 *   I3  checkHeaderPreservation -- missing/empty header fields
 *   I4  checkOpaqueFeatureInventory -- opaque feature counts (non-blocking info)
 *   I5  checkSidecarHash        -- matching vs. mismatched stored hash
 */

import { describe, it, expect, vi } from "vitest";
import {
  checkParseCompleteness,
  checkRoundTrip,
  checkHeaderPreservation,
  checkOpaqueFeatureInventory,
  checkSidecarHash,
  headerFieldLabel,
  HEADER_FIELD_MISSING_CODE,
  checkOwnershipConsistency,
} from "./layer-a-prime.js";
import { parse } from "../codec/parse.js";
import { computeSha256Hex } from "../codec/hash.js";
import { makePattern } from "@keyboard-studio/contracts";
import type { KeyboardIR, IRNodeRef } from "@keyboard-studio/contracts";

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
  return {
    origin: "imported",
    header: {
      keyboardId: "test-kb",
      name: "Test Keyboard",
      bcp47: ["en"],
      copyright: "(c) 2024 SIL",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
      ...overrides,
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
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
// I2 -- Round-trip check (deferred stub)
// ---------------------------------------------------------------------------

describe("checkRoundTrip (I2 stub)", () => {
  const ir = makeCleanIR();

  it("returns exactly one finding", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const findings = checkRoundTrip(ir);
    expect(findings).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("finding code is KM_HINT_ROUND_TRIP_DEFERRED", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const findings = checkRoundTrip(ir);
    expect(findings[0]?.code).toBe("KM_HINT_ROUND_TRIP_DEFERRED");
    vi.restoreAllMocks();
  });

  it("finding severity is 'hint' (non-blocking)", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const findings = checkRoundTrip(ir);
    expect(findings[0]?.severity).toBe("hint");
    vi.restoreAllMocks();
  });

  it("finding layer is 'A-prime'", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const findings = checkRoundTrip(ir);
    expect(findings[0]?.layer).toBe("A-prime");
    vi.restoreAllMocks();
  });

  it("does NOT emit a KM_ERROR_ROUND_TRIP_DIVERGENCE finding", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const findings = checkRoundTrip(ir);
    const divergence = findings.filter((f) => f.code === "KM_ERROR_ROUND_TRIP_DIVERGENCE");
    expect(divergence).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("logs corpus info to console.info once, including the [layer-a-prime] prefix", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    checkRoundTrip(ir);
    expect(infoSpy).toHaveBeenCalledOnce();
    const firstArg = infoSpy.mock.calls[0]?.[0] as string;
    expect(firstArg).toContain("[layer-a-prime] I2 corpus:");
    infoSpy.mockRestore();
  });

  it("handles an IR with typed vkey rules and includes vkeyCount in the log", () => {
    const irWithRules: KeyboardIR = {
      ...ir,
      groups: [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "r1",
              context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
              output: [{ kind: "char", value: "a" }],
            },
          ],
        },
      ],
    };
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const findings = checkRoundTrip(irWithRules);
    expect(findings[0]?.code).toBe("KM_HINT_ROUND_TRIP_DEFERRED");
    const firstArg = infoSpy.mock.calls[0]?.[0] as string;
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

  it("KM_WARN_HEADER_FIELD_MISSING when bcp47 is empty array", () => {
    const ir = makeCleanIR({ bcp47: [] });
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    expect(findings.find((f) => f.message.includes("bcp47"))).toBeDefined();
  });

  it("KM_WARN_HEADER_FIELD_MISSING when all bcp47 entries are blank", () => {
    const ir = makeCleanIR({ bcp47: ["", "  "] });
    const findings = checkHeaderPreservation(ir, EMITTED_WITH_ALL_HEADERS);
    expect(findings.find((f) => f.message.includes("bcp47"))).toBeDefined();
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
    const ir = makeCleanIR({ keyboardId: "", bcp47: [] });
    const findings = checkHeaderPreservation(ir, "");
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.code).toBe(HEADER_FIELD_MISSING_CODE);
      const label = headerFieldLabel(f);
      // Must extract a non-null label, and it must actually appear in the message.
      expect(label).not.toBeNull();
      expect(f.message).toContain(`"${label}"`);
    }
    // The known label set is recovered intact (guards the scanner's bcp47 filter).
    const labels = findings.map(headerFieldLabel);
    expect(labels).toContain("keyboardId");
    expect(labels).toContain("name (&NAME)");
    expect(labels).toContain("bcp47 (language tags)");
    expect(labels).toContain("copyright (&COPYRIGHT)");
    expect(labels).toContain("version (&KEYBOARDVERSION / &VERSION)");
  });

  it("returns null for a finding that is not a header-field-missing one", () => {
    expect(
      headerFieldLabel({
        code: "KM_HINT_ROUND_TRIP_DEFERRED",
        severity: "hint",
        layer: "A-prime",
        message: "Functional round-trip (I2) deferred: ...",
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
