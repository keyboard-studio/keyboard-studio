// Tests for projectWorkingCopyVfs's step 2.5 (desktop -> touch layer
// propagation) — wires propagateDesktopLayersToTouch (engine, generalized
// S-08) into the shared projection helper so the OSK preview and the
// downloaded artifact both surface a physical modifier-combo assignment onto
// the shipped `.keyman-touch-layout`.
//
// Coverage:
//   1. Touch layout present + a modifier_as_layer_switch assignment ->
//      the propagated layer id appears in the VFS touch-layout JSON, with
//      real (non-blank) key text derived from the freshly re-parsed .kmn.
//   2. No touch layout file in the VFS -> no-op (no file created, no
//      propagation warnings).
//   3. A touch-layout entry already carrying a Phase E (TouchGallery) edit
//      survives propagation — step 0's injected content is what step 2.5
//      operates on, not a stale copy.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_KMN =
  "store(&VERSION) '10.0'\n" +
  "store(&NAME) 'Test'\n" +
  "store(&TARGETS) 'any'\n" +
  "begin Unicode > use(main)\n" +
  "\n" +
  "group(main) using keys\n" +
  "\n" +
  "+ [K_A] > 'a'\n";

/**
 * Minimal test-only Pattern for modifier_as_layer_switch — a bare per-key
 * rule (not the real content pattern's store/any() indirection) so
 * buildComboKeyMap (engine) can resolve real per-vkey output directly,
 * exercising the full propagation path end to end.
 */
const RALT_PATTERN: Pattern = {
  id: "modifier_as_layer_switch",
  title: "Test layer-switch pattern",
  description: "test fixture",
  category: "desktop",
  appliesTo: [],
  strategyId: "S-08",
  questions: [],
  kmnFragment: "+ {{altgrKeyList}} > U+00E9\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "test",
  reviewDate: "2026-01-01",
};

/**
 * The REAL content pattern's fragment shape — a store/any()/index()
 * indirection, not a bare per-key rule (see content/patterns/desktop-input/
 * modifier-as-layer-switch.yaml). Regression coverage for the P0 gap where
 * buildComboKeyMap (engine) failed to resolve this shape and shipped blank
 * touch keycaps.
 */
const REAL_SHAPE_PATTERN: Pattern = {
  id: "modifier_as_layer_switch",
  title: "Test layer-switch pattern (real store/any/index shape)",
  description: "test fixture",
  category: "desktop",
  appliesTo: [],
  strategyId: "S-08",
  questions: [],
  kmnFragment:
    "store(altgrKeys)   {{altgrKeyList}}\n" +
    "store(altgrOutput) '{{altgrOutputList}}'\n" +
    "\n" +
    "+ any(altgrKeys) > index(altgrOutput, 1)\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "test",
  reviewDate: "2026-01-01",
};

function getPattern(id: string): Pattern | undefined {
  if (id === RALT_PATTERN.id) return RALT_PATTERN;
  return undefined;
}

function getRealShapePattern(id: string): Pattern | undefined {
  return id === REAL_SHAPE_PATTERN.id ? REAL_SHAPE_PATTERN : undefined;
}

function makeRaltAssignment(): MechanismAssignment {
  return {
    scope: "individual",
    target: "é",
    modality: "physical",
    mechanisms: [
      {
        patternId: "modifier_as_layer_switch",
        strategyId: "S-08",
        slotValues: { altgrKeyList: "[RALT K_E]", altgrOutputList: "é" },
      },
    ],
    source: "user",
  };
}

/** A "phone" platform with a default layer: K_E (plain) + K_NUMLOCK (anchor). */
function makeBaseTouchJson(): string {
  return JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "K_E", text: "e" },
                { id: "K_NUMLOCK", text: "*123*", nextlayer: "numeric" },
              ],
            },
          ],
        },
        { id: "numeric", row: [{ id: 1, key: [{ id: "K_1", text: "1" }] }] },
      ],
    },
  });
}

function makeVfsWithTouchLayout(touchJson: string) {
  return createVirtualFS([
    { path: "source/test_kb.kmn", content: BASE_KMN, isBinary: false },
    { path: "source/test_kb.keyman-touch-layout", content: touchJson, isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// 1. Touch layout present — propagated layer id + real key text
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs — step 2.5 desktop-to-touch layer propagation", () => {
  it("surfaces the modifier-combo layer id, with real key text from the freshly re-parsed .kmn", () => {
    const vfs = makeVfsWithTouchLayout(makeBaseTouchJson());

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makeRaltAssignment()],
      getPattern,
      identity: null,
    });

    const entry = vfs.get("source/test_kb.keyman-touch-layout");
    expect(entry).toBeDefined();
    const data = JSON.parse(entry!.content as string);
    const raltLayer = data.phone.layer.find((l: { id: string }) => l.id === "rightalt");
    expect(raltLayer).toBeDefined();
    const eKey = raltLayer.row[0].key.find((k: { id: string }) => k.id === "K_E");
    // Real key text, not blank — proves the propagation step was fed the
    // freshly re-parsed post-assignment .kmn, not a stale IR.
    expect(eKey.text).toBe("é");
    expect(eKey.output).toBe("é");
    // No propagation-step warnings (the missing-.kvks warning is step 3.5's
    // keycap-label projection — irrelevant to this test's fixture, which
    // ships no .kvks file).
    expect(warnings.some((w) => w.includes("propagation"))).toBe(false);
  });

  // P0 regression companion: the RALT_PATTERN fixture above uses a bare
  // per-key rule, which never exercised buildComboKeyMap's any()/index()
  // store-indirection path — the shape the real content pattern actually
  // uses. This test uses that real shape directly.
  it("surfaces real key text via the real pattern's store/any()/index() indirection shape", () => {
    const vfs = makeVfsWithTouchLayout(makeBaseTouchJson());

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makeRaltAssignment()],
      getPattern: getRealShapePattern,
      identity: null,
    });

    const entry = vfs.get("source/test_kb.keyman-touch-layout");
    const data = JSON.parse(entry!.content as string);
    const raltLayer = data.phone.layer.find((l: { id: string }) => l.id === "rightalt");
    expect(raltLayer).toBeDefined();
    const eKey = raltLayer.row[0].key.find((k: { id: string }) => k.id === "K_E");
    expect(eKey.text).toBe("é");
    expect(eKey.output).toBe("é");
    expect(warnings.some((w) => w.includes("propagation"))).toBe(false);
  });

  it("adds a reachability switch on the default layer's anchor key", () => {
    const vfs = makeVfsWithTouchLayout(makeBaseTouchJson());

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makeRaltAssignment()],
      getPattern,
      identity: null,
    });

    const entry = vfs.get("source/test_kb.keyman-touch-layout");
    const data = JSON.parse(entry!.content as string);
    const defaultLayer = data.phone.layer.find((l: { id: string }) => l.id === "default");
    const numlockKey = defaultLayer.row[0].key.find((k: { id: string }) => k.id === "K_NUMLOCK");
    expect(numlockKey.sk?.some((s: { nextlayer: string }) => s.nextlayer === "rightalt")).toBe(
      true,
    );
  });

  // ---------------------------------------------------------------------------
  // 2. No touch layout file — no-op
  // ---------------------------------------------------------------------------

  it("is a no-op when the VFS has no .keyman-touch-layout file", () => {
    const vfs = createVirtualFS([
      { path: "source/test_kb.kmn", content: BASE_KMN, isBinary: false },
    ]);

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makeRaltAssignment()],
      getPattern,
      identity: null,
    });

    expect(vfs.get("source/test_kb.keyman-touch-layout")).toBeUndefined();
    expect(warnings.some((w) => w.includes("propagation"))).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 3. TouchGallery's own edit survives propagation
  // ---------------------------------------------------------------------------

  it("preserves a Phase E (TouchGallery) edit already present in touchLayoutJson", () => {
    // Simulates buildTouchLayoutJson's output for a prior Phase E edit: the
    // default layer's K_Q carries a touch-only custom label unrelated to any
    // desktop combo. Passed as `touchLayoutJson` so step 0 injects it first
    // (as the real pipeline does) before step 2.5 propagates on top of it.
    const editedTouchJson = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  { id: "K_E", text: "e" },
                  { id: "K_NUMLOCK", text: "*123*", nextlayer: "numeric" },
                  { id: "K_Q", text: "touch-gallery-custom" },
                ],
              },
            ],
          },
          { id: "numeric", row: [{ id: 1, key: [{ id: "K_1", text: "1" }] }] },
        ],
      },
    });

    const vfs = createVirtualFS([
      { path: "source/test_kb.kmn", content: BASE_KMN, isBinary: false },
    ]);

    projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      baseIr: makeTestIR([]),
      deletedNodeIds: new Set(),
      assignments: [makeRaltAssignment()],
      getPattern,
      identity: null,
      touchLayoutJson: editedTouchJson,
    });

    const entry = vfs.get("source/test_kb.keyman-touch-layout");
    const data = JSON.parse(entry!.content as string);
    const defaultLayer = data.phone.layer.find((l: { id: string }) => l.id === "default");
    const qKey = defaultLayer.row[0].key.find((k: { id: string }) => k.id === "K_Q");
    // The TouchGallery-authored key is untouched by propagation.
    expect(qKey.text).toBe("touch-gallery-custom");

    // And the propagated combo layer was still added on top.
    const raltLayer = data.phone.layer.find((l: { id: string }) => l.id === "rightalt");
    expect(raltLayer).toBeDefined();
  });
});
