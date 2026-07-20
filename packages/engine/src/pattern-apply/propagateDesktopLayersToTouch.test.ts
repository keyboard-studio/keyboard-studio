// Tests for propagateDesktopLayersToTouch — surfaces arbitrary desktop
// modifier-combo layers (generalized S-08) onto a shipped
// `.keyman-touch-layout`.

import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { propagateDesktopLayersToTouch } from "./propagateDesktopLayersToTouch.js";
import { applyAssignments } from "./applyAssignments.js";
import { loadPatterns, getById } from "../pattern-library/index.js";
import { parse as parseKmn, emitTouchLayout } from "../codec/index.js";
import { scaffoldTouchLayout } from "../scaffolder/scaffoldTouchLayout.js";
import type { KeyboardIR, IRGroup, IRRule, MechanismAssignment } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _nodeSeq = 0;
function freshId(prefix: string): string {
  return `${prefix}:${++_nodeSeq}`;
}

function makeMinimalIR(groups: IRGroup[]): KeyboardIR {
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
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function makeRule(vkey: string, modifiers: string[], output: string): IRRule {
  return {
    nodeId: freshId("rule"),
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: output }],
  };
}

function makeGroup(rules: IRRule[]): IRGroup {
  return { nodeId: freshId("group"), name: "main", usingKeys: true, rules, readonly: false };
}

function makeAltgrAssignment(target: string, keySpec: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [
      { patternId: "modifier_as_layer_switch", slotValues: { altgrKeyList: keySpec } },
    ],
  };
}

/** A minimal default-layer-only phone platform, one row, one key. */
function makeDefaultOnlyTouchJson(): string {
  return JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "K_A", text: "a" },
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

// ---------------------------------------------------------------------------
// Synthesizing a missing layer
// ---------------------------------------------------------------------------

describe("propagateDesktopLayersToTouch — synthesizing a missing layer", () => {
  it("clones the default layer's geometry for a combo already used in the IR", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "x")])]);
    const rawJson = makeDefaultOnlyTouchJson();

    const { json, warnings } = propagateDesktopLayersToTouch(rawJson, ir, []);
    const data = JSON.parse(json);

    const ctrlLayer = data.phone.layer.find((l: { id: string }) => l.id === "ctrl");
    expect(ctrlLayer).toBeDefined();
    expect(ctrlLayer.row).toHaveLength(1);
    // K_A gets the combo's output.
    expect(ctrlLayer.row[0].key[0].id).toBe("K_A");
    expect(ctrlLayer.row[0].key[0].text).toBe("x");
    expect(ctrlLayer.row[0].key[0].output).toBe("x");
    // K_NUMLOCK had no CTRL-combo output — blank text, and its nextlayer is
    // repointed to "default" (the synthesized layer's way back).
    expect(ctrlLayer.row[0].key[1].id).toBe("K_NUMLOCK");
    expect(ctrlLayer.row[0].key[1].text).toBe("");
    expect(ctrlLayer.row[0].key[1].nextlayer).toBe("default");
    expect(warnings).toHaveLength(0);
  });

  it("strips sk/flick/multitap from cloned keys", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["ALT"], "y")])]);
    const rawJson = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [{ id: "K_A", text: "a", sk: [{ id: "U_00E2", text: "â" }] }],
              },
            ],
          },
        ],
      },
    });

    const { json } = propagateDesktopLayersToTouch(rawJson, ir, []);
    const data = JSON.parse(json);
    const altLayer = data.phone.layer.find((l: { id: string }) => l.id === "alt");
    expect(altLayer.row[0].key[0].sk).toBeUndefined();
  });

  it("adds a reachable longpress switch key on an anchor key when none exists", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "x")])]);
    const rawJson = makeDefaultOnlyTouchJson();

    const { json } = propagateDesktopLayersToTouch(rawJson, ir, []);
    const data = JSON.parse(json);

    const defaultLayer = data.phone.layer.find((l: { id: string }) => l.id === "default");
    const numlockKey = defaultLayer.row[0].key.find((k: { id: string }) => k.id === "K_NUMLOCK");
    // Primary function untouched.
    expect(numlockKey.nextlayer).toBe("numeric");
    expect(numlockKey.text).toBe("*123*");
    // A longpress sub-key added for the new layer.
    expect(numlockKey.sk).toEqual([
      expect.objectContaining({ nextlayer: "ctrl" }),
    ]);
  });

  it("skips adding a switch key when one already exists anywhere in the platform", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "x")])]);
    const rawJson = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  { id: "K_A", text: "a" },
                  { id: "K_LOPT", text: "*Menu*", sk: [{ id: "T_existing", nextlayer: "ctrl" }] },
                ],
              },
            ],
          },
        ],
      },
    });

    const { json } = propagateDesktopLayersToTouch(rawJson, ir, []);
    const data = JSON.parse(json);
    const lopt = data.phone.layer[0].row[0].key.find((k: { id: string }) => k.id === "K_LOPT");
    // Still exactly the one pre-existing sk entry — nothing appended.
    expect(lopt.sk).toEqual([{ id: "T_existing", nextlayer: "ctrl" }]);
  });

  it("warns when no anchor key is available and leaves the layer unreachable but valid", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "x")])]);
    const rawJson = JSON.stringify({
      phone: {
        layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
      },
    });

    const { json, warnings } = propagateDesktopLayersToTouch(rawJson, ir, []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unreachable");
    const data = JSON.parse(json);
    expect(data.phone.layer.find((l: { id: string }) => l.id === "ctrl")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Editing an existing layer
// ---------------------------------------------------------------------------

describe("propagateDesktopLayersToTouch — editing an existing layer", () => {
  it("only updates text/output on keys the combo defines — never restructures", () => {
    const ir = makeMinimalIR([
      makeGroup([makeRule("K_A", ["RALT"], "new-a"), makeRule("K_B", ["RALT"], "new-b")]),
    ]);
    const rawJson = JSON.stringify({
      phone: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] },
          {
            id: "rightalt",
            row: [
              {
                id: 1,
                key: [
                  { id: "K_A", text: "old-a", customField: "keep-me" },
                  { id: "K_UNRELATED", text: "untouched" },
                ],
              },
            ],
          },
        ],
      },
    });

    const { json, warnings } = propagateDesktopLayersToTouch(rawJson, ir, []);
    const data = JSON.parse(json);
    const layer = data.phone.layer.find((l: { id: string }) => l.id === "rightalt");

    expect(layer.row).toHaveLength(1); // no rows added/removed
    expect(layer.row[0].key).toHaveLength(2); // no keys added/removed
    expect(layer.row[0].key[0].text).toBe("new-a");
    expect(layer.row[0].key[0].output).toBe("new-a");
    expect(layer.row[0].key[0].customField).toBe("keep-me"); // unknown field preserved
    expect(layer.row[0].key[1].text).toBe("untouched"); // K_B not present in this layer — no-op
    expect(warnings).toHaveLength(0);
  });

  it("preserves unknown top-level and layer fields verbatim", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["SHIFT"], "A")])]);
    const rawJson = JSON.stringify({
      _comment: "hand-authored layout",
      phone: {
        defaultHint: "dot",
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] },
          { id: "shift", customLayerField: 42, row: [{ id: 1, key: [{ id: "K_A", text: "old" }] }] },
        ],
      },
    });

    const { json } = propagateDesktopLayersToTouch(rawJson, ir, []);
    const data = JSON.parse(json);
    expect(data._comment).toBe("hand-authored layout");
    expect(data.phone.defaultHint).toBe("dot");
    const shiftLayer = data.phone.layer.find((l: { id: string }) => l.id === "shift");
    expect(shiftLayer.customLayerField).toBe(42);
    expect(shiftLayer.row[0].key[0].text).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// Combo sourcing: union of IR + assignments
// ---------------------------------------------------------------------------

describe("propagateDesktopLayersToTouch — combo sourcing", () => {
  it("picks up a combo referenced only by a modifier_as_layer_switch assignment (not yet in the IR)", () => {
    const ir = makeMinimalIR([]); // no rules at all yet
    const rawJson = makeDefaultOnlyTouchJson();
    const assignments = [makeAltgrAssignment("Q", "[CTRL K_A]")];

    const { json } = propagateDesktopLayersToTouch(rawJson, ir, assignments);
    const data = JSON.parse(json);
    expect(data.phone.layer.find((l: { id: string }) => l.id === "ctrl")).toBeDefined();
  });

  it("synthesizes a touch layer for a combo containing CAPS — CAPS is a genuine navigable touch layer, not desktop-only", () => {
    const ir = makeMinimalIR([]);
    const rawJson = makeDefaultOnlyTouchJson();
    const assignments = [makeAltgrAssignment("Q", "[CAPS CTRL K_A]")];

    const { json, warnings } = propagateDesktopLayersToTouch(rawJson, ir, assignments);
    const data = JSON.parse(json);
    // canonicalizeCombo(["CAPS","CTRL"]) -> ["CTRL","CAPS"]; touch-layer-id
    // precedence order joins them as "ctrl-caps".
    const capsLayer = data.phone.layer.find((l: { id: string }) => l.id === "ctrl-caps");
    expect(capsLayer).toBeDefined();
    expect(data.phone.layer).toHaveLength(3); // default + numeric + ctrl-caps
    expect(warnings).toHaveLength(0);
  });

  it("skips the literal 'desktop' platform key", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "x")])]);
    const rawJson = JSON.stringify({
      desktop: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] },
      phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] },
    });

    const { json } = propagateDesktopLayersToTouch(rawJson, ir, []);
    const data = JSON.parse(json);
    expect(data.desktop.layer).toHaveLength(1); // untouched — no "ctrl" layer added
    expect(data.phone.layer.find((l: { id: string }) => l.id === "ctrl")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("propagateDesktopLayersToTouch — idempotency", () => {
  it("produces no further changes on a second run with the same inputs", () => {
    const ir = makeMinimalIR([makeGroup([makeRule("K_A", ["CTRL"], "x")])]);
    const rawJson = makeDefaultOnlyTouchJson();

    const first = propagateDesktopLayersToTouch(rawJson, ir, []);
    const second = propagateDesktopLayersToTouch(first.json, ir, []);

    expect(second.json).toBe(first.json);
    expect(second.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// P0 regression — the REAL production S-08 pattern's store-indirection shape
// (`store(altgrKeys)` / `store(altgrOutput)` + `any()`/`index()`, as opposed
// to one `[MODS VKEY] > 'char'` rule per key). buildComboKeyMap must resolve
// this shape or the synthesized touch layer ships with blank keycaps.
// ---------------------------------------------------------------------------

const REAL_CONTENT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../content/patterns",
);

describe("propagateDesktopLayersToTouch — real S-08 pattern (any/index store indirection)", () => {
  beforeAll(async () => {
    await loadPatterns(REAL_CONTENT_DIR);
  });

  it("surfaces real key text (not blank) for a SHIFT+RALT combo authored via the production pattern", () => {
    const pattern = getById("modifier_as_layer_switch");
    expect(pattern).toBeDefined();

    const baseKmn =
      "store(&VERSION) '10.0'\n" +
      "store(&NAME) 'Test'\n" +
      "store(&TARGETS) 'any'\n" +
      "begin Unicode > use(main)\n" +
      "\n" +
      "group(main) using keys\n" +
      "\n" +
      "+ [K_E] > 'e'\n";

    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "é",
      modality: "physical",
      mechanisms: [
        {
          patternId: "modifier_as_layer_switch",
          strategyId: "S-08",
          slotValues: { altgrKeyList: "[SHIFT RALT K_E]", altgrOutputList: "é" },
        },
      ],
      source: "user",
    };

    const { kmn, warnings } = applyAssignments(
      [assignment],
      (id) => (id === pattern!.id ? pattern : undefined),
      baseKmn,
    );
    expect(warnings).toEqual([]);

    const { ir } = parseKmn(kmn, "test_kb");

    const rawTouchJson = JSON.stringify({
      phone: {
        layer: [
          {
            id: "default",
            row: [{ id: 1, key: [{ id: "K_E", text: "e" }, { id: "K_LOPT", text: "*Menu*" }] }],
          },
        ],
      },
    });

    const { json } = propagateDesktopLayersToTouch(rawTouchJson, ir, [assignment]);
    const data = JSON.parse(json);

    const layer = data.phone.layer.find((l: { id: string }) => l.id === "rightalt-shift");
    expect(layer).toBeDefined();
    const eKey = layer.row[0].key.find((k: { id: string }) => k.id === "K_E");
    expect(eKey.text).toBe("é");
    expect(eKey.output).toBe("é");
  });
});

// ---------------------------------------------------------------------------
// P1-1 regression — scaffoldTouchLayout's Case A (no shipped touch layout)
// synthesizes its RALT-only layer under the id "altgr", not "rightalt"
// (comboToTouchLayerId's id for the same combo). Propagation must patch
// that existing layer rather than synthesizing a duplicate "rightalt" one.
// ---------------------------------------------------------------------------

describe("propagateDesktopLayersToTouch — Case A 'altgr' layer-id alias", () => {
  it("patches the real scaffoldTouchLayout-produced 'altgr' layer, no duplicate 'rightalt' layer", () => {
    // A RALT rule already present when the touch layout was first scaffolded.
    const initialIr = makeMinimalIR([
      makeGroup([makeRule("K_Q", ["RALT"], "1"), makeRule("K_Q", [], "q")]),
    ]);
    const rawTouchJson = emitTouchLayout(scaffoldTouchLayout(initialIr));

    // The author now assigns a second RALT key via the mechanism gallery —
    // the freshly re-parsed/updated IR carries both RALT rules.
    const updatedIr = makeMinimalIR([
      makeGroup([
        makeRule("K_Q", ["RALT"], "1"),
        makeRule("K_Q", [], "q"),
        makeRule("K_E", ["RALT"], "é"),
        makeRule("K_E", [], "e"),
      ]),
    ]);

    const { json } = propagateDesktopLayersToTouch(rawTouchJson, updatedIr, []);
    const data = JSON.parse(json);

    const altLayers = data.phone.layer.filter(
      (l: { id: string }) => l.id === "altgr" || l.id === "rightalt",
    );
    expect(altLayers).toHaveLength(1);
    expect(altLayers[0].id).toBe("altgr");

    const eKey = altLayers[0].row
      .flatMap((r: { key: { id: string }[] }) => r.key)
      .find((k: { id: string }) => k.id === "K_E");
    expect(eKey).toBeDefined();
    expect(eKey.text).toBe("é");
    expect(eKey.output).toBe("é");
  });
});
