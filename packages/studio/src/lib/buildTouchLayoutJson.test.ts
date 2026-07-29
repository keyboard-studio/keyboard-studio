// Tests for buildTouchLayoutJson — ROUTER coverage only.
//
// applyTouchAssignmentsToRawJson / applyTouchAssignments are already
// well-tested in packages/engine/src/pattern-apply/. applyDesktopModifications
// / applyDesktopModificationsToRawJson are covered in their own engine test
// files. These tests focus on whether the ROUTER (spec 035 R4/R9/R10) chooses
// the correct branch and threads `opts.mods` through for each combination of
// inputs:
//
//   Case B (raw path)   — seedSource "import-adapt" AND baseTouchJson is a
//     non-empty string → calls applyDesktopModificationsToRawJson then
//     applyTouchAssignmentsToRawJson; preserves all shipped platforms,
//     preserves non-IR fields (e.g. displayUnderlying), never synthesizes
//     phone; NEVER round-trips through the IR (R9).
//
//   Case A (IR path)    — seedSource "reseed-from-desktop", OR baseTouchJson
//     is undefined/"" (the import-adapt fallback) → runs scaffoldTouchLayout
//     (with any ir.touchLayout STRIPPED first — R10) → applyDesktopModifications
//     → applyTouchAssignments → emitTouchLayout, always produces a phone
//     platform and never carries the base's own shipped platforms.
//
//   malformed JSON      — non-JSON string as baseTouchJson
//     → the inner try/catch returns { json: null, warnings: [...] }.

import { describe, it, expect } from "vitest";
import { buildTouchLayoutJson, deriveSeedLayout, type BuildTouchLayoutJsonOpts } from "./buildTouchLayoutJson";
import type { KeyboardIR, TouchAssignment, TouchLayoutIR, IRGroup, IRRule, Pattern } from "@keyboard-studio/contracts";
import { touchCoverage } from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Minimal KeyboardIR for Case A (IR path) tests.
// Matches the shape used in scaffoldTouchLayout.test.ts.
// ---------------------------------------------------------------------------

function makeMinimalIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kb",
      name: "Test KB",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  };
}

const NO_MODS = { removals: [], placements: [] };

function opts(o: Partial<BuildTouchLayoutJsonOpts> = {}): BuildTouchLayoutJsonOpts {
  return { mods: NO_MODS, seedSource: "import-adapt", ...o };
}

// ---------------------------------------------------------------------------
// Compact inline tablet-only JSON fixture (no phone, has displayUnderlying).
// ---------------------------------------------------------------------------

const TABLET_ONLY_JSON = JSON.stringify({
  tablet: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
    displayUnderlying: false,
  },
});

// ---------------------------------------------------------------------------
// Helper: build a longpress TouchAssignment for a host key + char.
// ---------------------------------------------------------------------------

function longpress(hostKey: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [
      {
        patternId: "longpress_alternates",
        slotValues: { hostKey, char },
      },
    ],
    source: "user",
  };
}

// ---------------------------------------------------------------------------
// Case B — router → raw path
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case B (router → raw path)", () => {
  it("returned json parses to a valid object when baseTouchJson is provided", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      opts({ baseTouchJson: TABLET_ONLY_JSON }),
    );
    expect(result.json).not.toBeNull();
    expect(JSON.parse(result.json!)).toBeTypeOf("object");
  });

  it("preserves ONLY shipped platforms — no 'phone' synthesized", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      opts({ baseTouchJson: TABLET_ONLY_JSON }),
    );
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["tablet"]);
    expect("phone" in parsed).toBe(false);
  });

  it("splices longpress assignments into the matching key", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      opts({ baseTouchJson: TABLET_ONLY_JSON }),
    );
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as {
      tablet: { layer: Array<{ row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const kaKey = parsed.tablet.layer[0]?.row[0]?.key.find((k) => k.id === "K_A");
    expect(kaKey?.sk).toBeDefined();
    expect(Array.isArray(kaKey!.sk)).toBe(true);
    expect(kaKey!.sk!.length).toBeGreaterThan(0);
  });

  it("preserves non-IR fields like displayUnderlying", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      opts({ baseTouchJson: TABLET_ONLY_JSON }),
    );
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as { tablet: { displayUnderlying?: unknown } };
    expect(parsed.tablet.displayUnderlying).toBe(false);
  });

  it("returns no warnings for matched host keys", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      opts({ baseTouchJson: TABLET_ONLY_JSON }),
    );
    const unexpectedWarnings = result.warnings.filter(
      (w) => w.includes("not found") || w.includes("unmatched"),
    );
    expect(unexpectedWarnings).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // New: desktop-modification replay on the raw path (R3/R9).
  // -------------------------------------------------------------------------

  describe("desktop-modification replay (carve removal + placement)", () => {
    const SHIPPED_WITH_CARVE_CANDIDATE = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  { id: "K_A", text: "á" },
                  { id: "K_S", text: "s", layer: "default", width: "10" },
                ],
              },
            ],
          },
        ],
      },
      tablet: {
        layer: [
          {
            id: "default",
            row: [{ id: 1, key: [{ id: "K_B", text: "b", sk: [{ id: "T_alt", text: "á" }] }] }],
          },
        ],
        displayUnderlying: true,
      },
    });

    it("removes the carved char everywhere (primary text AND sk entry on another platform) and reflects a placement", () => {
      const result = buildTouchLayoutJson(makeMinimalIR(), [], {
        baseTouchJson: SHIPPED_WITH_CARVE_CANDIDATE,
        mods: { removals: ["á"], placements: [{ char: "é", hostKey: "K_S" }] },
        seedSource: "import-adapt",
      });
      expect(result.json).not.toBeNull();
      const parsed = JSON.parse(result.json!) as {
        phone: { layer: Array<{ row: Array<{ key: Array<Record<string, unknown>> }> }> };
        tablet: { layer: Array<{ row: Array<{ key: Array<Record<string, unknown>> }> }> };
      };

      // Primary production carved (phone K_A): key kept, text cleared.
      const kaKey = parsed.phone.layer[0]!.row[0]!.key.find((k) => k["id"] !== "K_S");
      expect(kaKey).toBeDefined();
      expect(kaKey!["text"]).toBeUndefined();

      // sk entry carved on the OTHER platform (tablet K_B).
      const kbKey = parsed.tablet.layer[0]!.row[0]!.key.find((k) => k["id"] === "K_B");
      expect(kbKey).toBeDefined();
      const sk = (kbKey!["sk"] as Array<Record<string, unknown>>) ?? [];
      expect(sk.some((s) => s["text"] === "á")).toBe(false);

      // The carved char appears nowhere in the whole document.
      expect(result.json).not.toContain('"á"');

      // Placement reflected on the phone default layer's host key.
      const ksKey = parsed.phone.layer[0]!.row[0]!.key.find((k) => k["id"] === "K_S");
      expect(ksKey).toBeDefined();
      const ksSk = (ksKey!["sk"] as Array<Record<string, unknown>>) ?? [];
      expect(ksSk.some((s) => s["text"] === "é")).toBe(true);

      // Untouched fields on the placement's own host key survive byte-identical.
      expect(ksKey!["layer"]).toBe("default");
      expect(ksKey!["width"]).toBe("10");
    });
  });

  // ---------------------------------------------------------------------------
  // T018 — multi-platform fixture exercising every producer kind (text/output/
  // sk/flick/multitap) across TWO platforms in ONE build, plus the verbatim-
  // sensitive fields emitTouchLayout would drop on the IR path (per-key
  // `layer`, platform `displayUnderlying`/`font`/`fontsize`, string-form
  // `sp`/`width`/`pad`) — spec 035 R9.
  // ---------------------------------------------------------------------------

  describe("multi-platform verbatim fixture (carve across all producer kinds + placement + preserved fields)", () => {
    type RawTestKey = Record<string, unknown>;

    const MULTI_PLATFORM_FIXTURE = {
      phone: {
        displayUnderlying: true,
        font: "Gentium",
        fontsize: "20",
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  // Primary `text` producer — carve target ("á").
                  { id: "K_A", text: "á", layer: "default", sp: "1", width: "150", pad: "5" },
                  // Placement host — non-empty text, so the placement lands as sk[].
                  { id: "K_S", text: "s", layer: "default", width: "10" },
                  // flick{} producer — carve target on a direction entry ("à").
                  { id: "K_F", text: "f", flick: { n: { id: "T_flick_n", text: "à" } } },
                  // multitap[] producer — carve target ("î").
                  { id: "K_M", text: "m", multitap: [{ id: "T_multi_1", text: "î" }] },
                ],
              },
            ],
          },
          {
            // Untouched shift layer — no carved/placed chars anywhere in it —
            // proves an entire layer survives byte-identical, `output` field
            // and per-key `layer` included.
            id: "shift",
            row: [{ id: 1, key: [{ id: "K_A", output: "Á", layer: "shift" }] }],
          },
        ],
      },
      tablet: {
        displayUnderlying: false,
        font: "Awami",
        fontsize: "18",
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  // sk[] producer on a DIFFERENT platform than the flick/multitap
                  // carve targets — proves removal walks every platform.
                  { id: "K_B", text: "b", sk: [{ id: "T_alt", text: "á" }] },
                  // Primary `output` producer — carve target ("à").
                  { id: "K_C", output: "à" },
                ],
              },
            ],
          },
        ],
      },
    };
    const MULTI_PLATFORM_JSON = JSON.stringify(MULTI_PLATFORM_FIXTURE);

    function buildMultiPlatform() {
      return buildTouchLayoutJson(makeMinimalIR(), [], {
        baseTouchJson: MULTI_PLATFORM_JSON,
        mods: { removals: ["á", "à", "î"], placements: [{ char: "é", hostKey: "K_S" }] },
        seedSource: "import-adapt",
      });
    }

    function parseResult(result: ReturnType<typeof buildMultiPlatform>) {
      expect(result.json).not.toBeNull();
      return JSON.parse(result.json!) as {
        phone: {
          displayUnderlying: unknown;
          font: unknown;
          fontsize: unknown;
          layer: Array<{ id: string; row: Array<{ key: RawTestKey[] }> }>;
        };
        tablet: {
          displayUnderlying: unknown;
          font: unknown;
          fontsize: unknown;
          layer: Array<{ id: string; row: Array<{ key: RawTestKey[] }> }>;
        };
      };
    }

    it("removes the carved chars from every producer kind (text/output/sk/flick/multitap) on both platforms", () => {
      const result = buildMultiPlatform();

      // Blunt whole-document check first — none of the carved chars survive anywhere.
      expect(result.json).not.toContain('"á"');
      expect(result.json).not.toContain('"à"');
      expect(result.json).not.toContain('"î"');

      const parsed = parseResult(result);
      const phoneDefaultKeys = parsed.phone.layer[0]!.row[0]!.key;
      const tabletDefaultKeys = parsed.tablet.layer[0]!.row[0]!.key;

      // phone: primary `text` carved -> inert placeholder (id changed, text/output gone).
      // Found by a field the carve never touches (`sp`), since its `id` changes.
      const kaPlaceholder = phoneDefaultKeys.find((k) => k["sp"] === "1");
      expect(kaPlaceholder).toBeDefined();
      expect(kaPlaceholder!["id"]).not.toBe("K_A");
      expect(kaPlaceholder!["text"]).toBeUndefined();
      expect(kaPlaceholder!["output"]).toBeUndefined();

      // phone: flick direction entry carved -> the direction key is dropped entirely.
      const kf = phoneDefaultKeys.find((k) => k["id"] === "K_F")!;
      expect((kf["flick"] as Record<string, unknown> | undefined)?.["n"]).toBeUndefined();

      // phone: multitap entry carved -> filtered to empty.
      const km = phoneDefaultKeys.find((k) => k["id"] === "K_M")!;
      expect(km["multitap"]).toEqual([]);

      // tablet: sk entry carved -> filtered to empty.
      const kb = tabletDefaultKeys.find((k) => k["id"] === "K_B")!;
      expect(kb["sk"]).toEqual([]);

      // tablet: primary `output` carved -> inert placeholder (id changed, output gone).
      const kcPlaceholder = tabletDefaultKeys.find((k) => k["id"] !== "K_B");
      expect(kcPlaceholder).toBeDefined();
      expect(kcPlaceholder!["id"]).not.toBe("K_C");
      expect(kcPlaceholder!["output"]).toBeUndefined();
    });

    it("reflects the placement as a longpress alternate on the placement host key", () => {
      const parsed = parseResult(buildMultiPlatform());
      const phoneDefaultKeys = parsed.phone.layer[0]!.row[0]!.key;
      const ks = phoneDefaultKeys.find((k) => k["id"] === "K_S")!;
      const sk = (ks["sk"] as RawTestKey[]) ?? [];
      expect(sk.some((s) => s["text"] === "é")).toBe(true);
    });

    it("preserves platform-level displayUnderlying/font/fontsize byte-identically on BOTH platforms", () => {
      const parsed = parseResult(buildMultiPlatform());
      expect(parsed.phone.displayUnderlying).toBe(true);
      expect(parsed.phone.font).toBe("Gentium");
      expect(parsed.phone.fontsize).toBe("20");
      expect(parsed.tablet.displayUnderlying).toBe(false);
      expect(parsed.tablet.font).toBe("Awami");
      expect(parsed.tablet.fontsize).toBe("18");
    });

    it("preserves the untouched shift-layer key verbatim (per-key layer + output field, no carved/placed chars)", () => {
      const parsed = parseResult(buildMultiPlatform());
      const shiftKey = parsed.phone.layer[1]!.row[0]!.key[0];
      expect(shiftKey).toEqual({ id: "K_A", output: "Á", layer: "shift" });
    });

    it("preserves string-form sp/width/pad on the carved placeholder and layer/width on the placement key", () => {
      const parsed = parseResult(buildMultiPlatform());
      const phoneDefaultKeys = parsed.phone.layer[0]!.row[0]!.key;

      const kaPlaceholder = phoneDefaultKeys.find((k) => k["sp"] === "1")!;
      expect(kaPlaceholder["sp"]).toBe("1");
      expect(typeof kaPlaceholder["sp"]).toBe("string");
      expect(kaPlaceholder["width"]).toBe("150");
      expect(typeof kaPlaceholder["width"]).toBe("string");
      expect(kaPlaceholder["pad"]).toBe("5");
      expect(typeof kaPlaceholder["pad"]).toBe("string");
      expect(kaPlaceholder["layer"]).toBe("default");

      const ks = phoneDefaultKeys.find((k) => k["id"] === "K_S")!;
      expect(ks["layer"]).toBe("default");
      expect(ks["width"]).toBe("10");
      expect(typeof ks["width"]).toBe("string");
    });
  });
});

// ---------------------------------------------------------------------------
// Case A — router → IR path (baseTouchJson undefined)
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case A (router → IR path, undefined)", () => {
  it("returned json parses to a valid object when baseTouchJson is omitted", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ seedSource: "reseed-from-desktop" }));
    expect(result.json).not.toBeNull();
    expect(JSON.parse(result.json!)).toBeTypeOf("object");
  });

  it("synthesizes a 'tablet' platform — proving the IR path ran (buildCaseASeed requests platformStyle:\"tablet\")", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ seedSource: "reseed-from-desktop" }));
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect("tablet" in parsed).toBe(true);
  });

  it("tablet platform includes a 'default' layer", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ seedSource: "reseed-from-desktop" }));
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as { tablet: { layer: Array<{ id: string }> } };
    expect(parsed.tablet.layer.map((l) => l.id)).toContain("default");
  });

  // -------------------------------------------------------------------------
  // New: R10 strip — reseed on a base WITH a populated ir.touchLayout must
  // discard it entirely (scaffoldTouchLayout would otherwise preserve-and-
  // augment it, violating US2-AS4).
  // -------------------------------------------------------------------------

  it("R10: reseed on a baseIr with a populated ir.touchLayout emits ONLY the scaffolder's own tablet projection — no carried-over shipped content", () => {
    const existingTouchLayout: TouchLayoutIR = {
      platforms: [
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [{ keys: [{ nodeId: "existing_key_1", id: "K_A", text: "a" }] }],
            },
          ],
        },
      ],
      nodeIds: [],
    };

    const baseIr = makeMinimalIR({ touchLayout: existingTouchLayout });
    const result = buildTouchLayoutJson(baseIr, [], opts({ seedSource: "reseed-from-desktop" }));

    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    // The scaffolder's own tablet projection is the ONLY platform present —
    // its platform id happens to collide with the shipped one ("tablet"), so
    // the R10 strip proof here is about CONTENT, not platform-id absence: the
    // shipped layout's sole key (a single "K_A"/"a" key in a single-key row)
    // must not survive verbatim into the projected default layer.
    expect(Object.keys(parsed)).toEqual(["tablet"]);
    const tablet = parsed["tablet"] as { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
    const defaultLayer = tablet.layer.find((l) => l.id === "default")!;
    const firstRowKeys = defaultLayer.row[0]!.key;
    // The scaffolder's tablet default layer always starts with the digit row
    // (10 digits + K_BKSP) — never the shipped single "K_A"/"a" key.
    expect(firstRowKeys.length).toBeGreaterThan(1);
    expect(firstRowKeys[0]!["id"]).not.toBe("K_A");
    expect(firstRowKeys[0]!["text"]).not.toBe("a");
  });

  // -------------------------------------------------------------------------
  // T020 — R10 strip, full assertion: a distinctive marker the scaffolder
  // could never generate (a bespoke platform id AND a bespoke key id/text
  // combination) must be completely absent from the reseed output, and the
  // surviving tablet platform must have exactly the scaffolder's canonical
  // layer shape (default/shift/numeric — mirrors scaffoldTouchLayout.test.ts's
  // tablet "no AltGr mappings" layer-shape assertion). This is the
  // strongest form of the R10 strip proof: it is not enough that "desktop" as
  // a platform id is absent — no trace of the shipped layout's content may
  // leak into the tablet platform either.
  // -------------------------------------------------------------------------

  it("R10 (full assertion): a distinctive shipped platform+key never generated by the scaffolder is wholly absent, and the tablet platform has exactly the canonical default/shift/numeric layer shape", () => {
    const IMPOSSIBLE_MARKER_TEXT = "ZZZ_IMPOSSIBLE_SCAFFOLD_MARKER_ZZZ";
    const existingTouchLayout: TouchLayoutIR = {
      platforms: [
        {
          id: "desktop", // a platform id the phone-only Case A projection never emits
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    {
                      nodeId: "impossible_marker_node",
                      id: "T_impossible_marker", // a key id the scaffolder's template never mints
                      text: IMPOSSIBLE_MARKER_TEXT,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    };

    const baseIr = makeMinimalIR({ touchLayout: existingTouchLayout });
    const result = buildTouchLayoutJson(baseIr, [], opts({ seedSource: "reseed-from-desktop" }));

    expect(result.json).not.toBeNull();

    // Blunt whole-document check: the marker text/id/platform appear NOWHERE.
    expect(result.json).not.toContain(IMPOSSIBLE_MARKER_TEXT);
    expect(result.json).not.toContain("T_impossible_marker");
    expect(result.json).not.toContain('"desktop"');

    const parsed = JSON.parse(result.json!) as { tablet: { layer: Array<{ id: string }> } };
    // Exactly the tablet platform survives (mirrors scaffoldTouchLayout.test.ts's
    // tablet canonical-shape assertion for an IR with no AltGr mappings).
    expect(Object.keys(JSON.parse(result.json!) as Record<string, unknown>)).toEqual(["tablet"]);
    expect(parsed.tablet.layer.map((l) => l.id)).toEqual(["default", "shift", "numeric"]);
  });
});

// ---------------------------------------------------------------------------
// T020 — reseed replay reaches Case A: `mods.placements` must land on the
// projected tablet default layer (proves `applyDesktopModifications` is
// actually invoked on the reseed path, not just a passthrough scaffold).
// `applyDesktopModifications`'s placement pass resolves the mobile platform
// via `resolveMobilePlatformIndex` ("phone" if present, else "tablet"), so
// this still lands correctly now that buildCaseASeed's seed is tablet-only.
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case A reseed replay (mods.placements land on the projection)", () => {
  it("a Phase C placement (mods.placements) appears as a longpress alternate on its host key in the reseed projection", () => {
    // K_A's default-layer text is "a" via the scaffolder's US_KEYCAPS fallback
    // (no stores/groups on makeMinimalIR), so a placement on K_A is the
    // host-present branch of applyDesktopModifications: it lands in sk[].
    const result = buildTouchLayoutJson(makeMinimalIR(), [], {
      mods: { removals: [], placements: [{ char: "á", hostKey: "K_A" }] },
      seedSource: "reseed-from-desktop",
    });

    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as {
      tablet: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
    };
    const defaultLayer = parsed.tablet.layer.find((l) => l.id === "default")!;
    const kaKey = defaultLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "K_A")!;
    expect(kaKey).toBeDefined();
    const sk = (kaKey["sk"] as Array<Record<string, unknown>>) ?? [];
    expect(sk.some((s) => s["text"] === "á")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// unplacedChars is a TRUE reachability diagnostic (not a log of internal
// placement events): a character spilled onto the space bar's "extras" sk[]
// IS reachable there, so it does NOT appear in unplacedChars — only a
// character reachable NOWHERE in the derived layout does. Case A only — Case
// B never runs the scaffolder (raw-JSON splice), so it always reports
// unplacedChars: [].
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson / deriveSeedLayout — unplacedChars", () => {
  /** IR with a rule producing `overflowChar` on a vkey with no compact-layout
   *  slot and no known physical neighbor (see OVERFLOW_NEAREST_SLOT in
   *  scaffoldTouchLayout.ts) — the "extras" spill path. The character ends up
   *  reachable (on the space bar's sk[]), so this is NOT a data-loss fixture. */
  function makeOverflowIR(overflowChar: string): KeyboardIR {
    const rule: IRRule = {
      nodeId: "rule:overflow",
      context: [{ kind: "vkey", name: "K_oE2", modifiers: [] }],
      output: [{ kind: "char", value: overflowChar }],
    };
    const group: IRGroup = {
      nodeId: "group:overflow",
      name: "main",
      usingKeys: true,
      rules: [rule],
      readonly: false,
    };
    return makeMinimalIR({ groups: [group] });
  }

  /**
   * IR with a genuinely-unreachable rejected deadkey-successor candidate: a
   * symbol unrelated to the base letter it was rejected from, never assigned
   * to any vkey elsewhere, and not a digit/numeric-layer literal — so it ends
   * up nowhere in the derived layout. Mirrors the engine-level fixture in
   * scaffoldTouchLayout.test.ts ("genuinely unreachable elsewhere").
   */
  function makeUnreachableSymbolIR(symbol: string): KeyboardIR {
    const baseVkey = "K_E";
    const baseChar = "e";
    const bodyRule: IRRule = {
      nodeId: "rule:body",
      context: [
        { kind: "deadkey", id: 1 } as never,
        { kind: "any", storeRef: "s_base" },
      ],
      output: [{ kind: "index", storeRef: "s_out", offset: 2 }],
    };
    const baseLetterRule: IRRule = {
      nodeId: "rule:base",
      context: [{ kind: "vkey", name: baseVkey, modifiers: [] }],
      output: [{ kind: "char", value: baseChar }],
    };
    const pattern: Pattern = {
      id: "test_s02_unreachable",
      title: "Rejected candidate with no home anywhere in the layout",
      description: "Locks the TRUE data-loss diagnostic at the buildTouchLayoutJson router level",
      category: "desktop",
      appliesTo: [],
      strategyId: "S-02",
      origin: "recognized",
      ownedNodes: [{ nodeId: "rule:body", kind: "rule" }],
      questions: [],
      kmnFragment: "+ [K_TILDE] > dk(z)\ndk(z) + any(s_base) > index(s_out, 2)",
      tests: [],
      validatedForFamilies: [],
      sourceKeyboards: [],
      reviewedBy: "test",
      reviewDate: "2026-07-28",
    };
    return makeMinimalIR({
      groups: [
        {
          nodeId: "group:main",
          name: "main",
          usingKeys: true,
          rules: [baseLetterRule, bodyRule],
          readonly: false,
        },
      ],
      stores: [
        { nodeId: "store:base", name: "s_base", items: [{ kind: "char", value: baseChar }], isSystem: false },
        { nodeId: "store:out", name: "s_out", items: [{ kind: "char", value: symbol }], isSystem: false },
      ],
      recognizedPatterns: [pattern],
    });
  }

  it("Case A (reseed): unplacedChars does NOT contain a character spilled onto the space bar's extras sk[] — it is reachable there", () => {
    const overflowChar = "ʔ";
    const result = buildTouchLayoutJson(
      makeOverflowIR(overflowChar),
      [],
      opts({ seedSource: "reseed-from-desktop" }),
    );
    expect(result.unplacedChars).not.toContain(overflowChar);
  });

  it("Case A: unplacedChars is empty when nothing was spilled", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ seedSource: "reseed-from-desktop" }));
    expect(result.unplacedChars).toEqual([]);
  });

  it("Case A (reseed): unplacedChars DOES contain a rejected deadkey-successor candidate that is genuinely unreachable elsewhere", () => {
    const symbol = "§";
    const result = buildTouchLayoutJson(
      makeUnreachableSymbolIR(symbol),
      [],
      opts({ seedSource: "reseed-from-desktop" }),
    );
    expect(result.unplacedChars).toContain(symbol);
  });

  it("Case B (raw path): unplacedChars is always empty — the scaffolder never runs", () => {
    const result = buildTouchLayoutJson(
      makeUnreachableSymbolIR("§"),
      [],
      opts({ baseTouchJson: TABLET_ONLY_JSON }),
    );
    expect(result.unplacedChars).toEqual([]);
  });

  it("deriveSeedLayout (Case A): unplacedChars contains a genuinely-unreachable character, not a spilled-but-reachable one", () => {
    const symbol = "§";
    const result = deriveSeedLayout(makeUnreachableSymbolIR(symbol), {
      mods: NO_MODS,
      seedSource: "reseed-from-desktop",
    });
    expect(result.unplacedChars).toContain(symbol);
  });
});

// ---------------------------------------------------------------------------
// Case A — router → IR path (baseTouchJson === "")
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — Case A (router → IR path, empty string)", () => {
  it("routes to Case A when baseTouchJson is empty string", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ baseTouchJson: "" }));
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect("tablet" in parsed).toBe(true);
  });

  it("empty string and undefined produce equivalent output", () => {
    const resultUndefined = buildTouchLayoutJson(makeMinimalIR(), [], opts());
    const resultEmpty = buildTouchLayoutJson(makeMinimalIR(), [], opts({ baseTouchJson: "" }));

    const parsedUndefined = JSON.parse(resultUndefined.json!) as Record<string, unknown>;
    const parsedEmpty = JSON.parse(resultEmpty.json!) as Record<string, unknown>;

    expect("tablet" in parsedUndefined).toBe(true);
    expect("tablet" in parsedEmpty).toBe(true);
    expect("phone" in parsedUndefined).toBe(false);
    expect("phone" in parsedEmpty).toBe(false);
  });

  // -------------------------------------------------------------------------
  // New: seedSource "import-adapt" with no baseTouchJson falls back to Case A.
  // See buildTouchLayoutJson.ts's header comment for the documented fallback.
  // -------------------------------------------------------------------------

  it("seedSource 'import-adapt' with baseTouchJson absent falls back to Case A", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ seedSource: "import-adapt" }));
    expect(result.json).not.toBeNull();
    const parsed = JSON.parse(result.json!) as Record<string, unknown>;
    expect("tablet" in parsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// New: derivation is unconditional — empty mods + empty assignments still
// emits. Emission GATING (whether the caller injects/serializes this result)
// is the R11 matrix, implemented at the call sites, not here.
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — unconditional derivation", () => {
  it("emits a non-null layout with empty mods and empty assignments (Case A)", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ seedSource: "reseed-from-desktop" }));
    expect(result.json).not.toBeNull();
  });

  it("emits a non-null layout with empty mods and empty assignments (Case B)", () => {
    const result = buildTouchLayoutJson(makeMinimalIR(), [], opts({ baseTouchJson: TABLET_ONLY_JSON }));
    expect(result.json).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON — try/catch returns { json: null, warnings }
// ---------------------------------------------------------------------------

describe("buildTouchLayoutJson — malformed baseTouchJson", () => {
  it("returns json:null when baseTouchJson is not valid JSON", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      opts({ baseTouchJson: "this is not json {{{" }),
    );
    expect(result.json).toBeNull();
  });

  it("includes a warning message when baseTouchJson is malformed", () => {
    const result = buildTouchLayoutJson(
      makeMinimalIR(),
      [longpress("K_A", "á")],
      opts({ baseTouchJson: "this is not json {{{" }),
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/\[buildTouchLayoutJson\] failed:/);
  });

  it("never throws — always returns a BuildTouchLayoutJsonResult", () => {
    let threw = false;
    try {
      buildTouchLayoutJson(makeMinimalIR(), [], opts({ baseTouchJson: "{bad json" }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveSeedLayout (Case B / parse path) + touchCoverage — a char reachable
// ONLY via a flick direction on the shipped layout must be detected as
// covered, not reported uncovered (parseTouchLayout previously dropped flick
// entries entirely, which fed a false "uncovered" result into TouchGallery's
// detection/lint/completion-gate call sites).
// ---------------------------------------------------------------------------

describe("deriveSeedLayout — Case B flick-only coverage (parse/detection path)", () => {
  const SHIPPED_WITH_FLICK_ONLY_CHAR = JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                {
                  id: "K_E",
                  text: "e",
                  flick: { ne: { id: "K_E_ne", text: "é", output: "é" } },
                },
              ],
            },
          ],
        },
      ],
    },
  });

  it("touchCoverage reports no uncovered chars for an inventory char reachable only via a flick direction", () => {
    const { layout } = deriveSeedLayout(makeMinimalIR(), {
      baseTouchJson: SHIPPED_WITH_FLICK_ONLY_CHAR,
      mods: NO_MODS,
      seedSource: "import-adapt",
    });
    const result = touchCoverage(layout, ["é"]);
    expect(result.uncovered).toEqual([]);
  });
});
