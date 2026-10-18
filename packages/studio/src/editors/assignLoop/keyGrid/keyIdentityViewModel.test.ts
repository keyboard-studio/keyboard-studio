// keyIdentityViewModel — spec 104 FR-025 / US6: the panel's identity model.
//
// Fixtures are the Wave 1 idiom pairs (packages/engine/src/pattern-apply/
// __fixtures__/touch-id), parsed with the real codec — the same Cameroon
// shape US6's independent test names (select T_0300: criterion, per-state
// productions with sources, the guard store it belongs to).

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import {
  buildTouchKeyRuleIndex,
  type KeyIdentityDecision,
  type KeyboardIR,
  type TouchKeyIR,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { parseKmn, parseTouchLayout, severTouchKey } from "@keyboard-studio/engine";
import {
  buildKeyIdentityViewModel,
  type BuildKeyIdentityViewModelInputs,
} from "./keyIdentityViewModel.ts";

const FIXTURE_ROOT = path.resolve(
  process.cwd(),
  "../engine/src/pattern-apply/__fixtures__/touch-id",
);

function loadFixture(name: string): { ir: KeyboardIR; layout: TouchLayoutIR } {
  const dir = path.join(FIXTURE_ROOT, name);
  const { ir } = parseKmn(fs.readFileSync(path.join(dir, `${name}.kmn`), "utf8"), name);
  const layout = parseTouchLayout(
    fs.readFileSync(path.join(dir, `${name}.keyman-touch-layout`), "utf8"),
  );
  ir.touchLayout = layout;
  return { ir, layout };
}

function findKey(layout: TouchLayoutIR, platformId: string, layerId: string, keyId: string): TouchKeyIR {
  const platform = layout.platforms.find((p) => p.id === platformId);
  const layer = platform?.layers.find((l) => l.id === layerId);
  const key = layer?.rows.flatMap((r) => r.keys).find((k) => k.id === keyId);
  if (key === undefined) throw new Error(`fixture key ${keyId} not on ${platformId}/${layerId}`);
  return key;
}

function build(
  fixture: { ir: KeyboardIR; layout: TouchLayoutIR },
  platformId: string,
  layerId: string,
  keyId: string,
  extra?: Partial<BuildKeyIdentityViewModelInputs>,
) {
  return buildKeyIdentityViewModel({
    ir: fixture.ir,
    ruleIndex: buildTouchKeyRuleIndex(fixture.ir),
    layout: fixture.layout,
    platformId,
    layerId,
    key: findKey(fixture.layout, platformId, layerId, keyId),
    ...extra,
  });
}

describe("buildKeyIdentityViewModel — Cameroon T_0300 (US6 independent test)", () => {
  const fixture = loadFixture("sil_cameroon_qwerty");
  const vm = build(fixture, "tablet", "default", "T_0300");

  it("names the derived criterion: arm (a), a ruled T_ identity", () => {
    expect(vm.form).toBe("T_");
    expect(vm.criterion.source).toBe("derived");
    expect(vm.criterion.criterion).toBe("a");
    expect(vm.criterion.detail).toContain("ruled T_ identity");
  });

  it("lists a production row for every layer the key occurs on, and no others", () => {
    expect(vm.productionRows.map((r) => r.layerId)).toEqual(["default", "shift"]);
  });

  it("resolves per-state production from the rule, with the guard as a condition", () => {
    const row = vm.productionRows.find((r) => r.layerId === "default");
    expect(row?.stateLabel).toBe("state 0");
    expect(row?.production.source).toBe("rule");
    expect(row?.production.contextConditional).toBe(true);
    const texts = row?.production.productions.filter((e) => e.output.kind === "text");
    expect(texts).toHaveLength(1);
    expect(texts[0]?.output).toEqual({ kind: "text", text: "̀" });
    // The guard store the key belongs to is named by the carve-out's condition.
    const guardEntry = row?.production.productions.find(
      (e) => e.output.kind === "none" && e.condition !== undefined && e.condition !== "otherwise",
    );
    expect(guardEntry?.condition).toContain("diablock");
  });
});

describe("buildKeyIdentityViewModel — K_ key riding the fallback", () => {
  const fixture = loadFixture("sil_cameroon_qwerty");
  const vm = build(fixture, "tablet", "default", "K_1");

  it("keeps the link: arm 0 (undecidable equality, FR-004)", () => {
    expect(vm.criterion.criterion).toBe("0");
    expect(vm.criterion.source).toBe("derived");
  });

  it("marks fallback-supplied states: state 0 and SHIFT produce, RALT does not", () => {
    const byLayer = new Map(vm.productionRows.map((r) => [r.layerId, r.production]));
    expect(byLayer.get("default")?.source).toBe("k-fallback");
    expect(byLayer.get("default")?.productions[0]?.output).toEqual({ kind: "text", text: "1" });
    expect(byLayer.get("shift")?.source).toBe("k-fallback");
    expect(byLayer.get("rightalt")?.source).toBe("none");
  });
});

describe("buildKeyIdentityViewModel — hindi_flick ruled U_ (arm b + decode fall-through)", () => {
  const fixture = loadFixture("hindi_flick");
  const vm = build(fixture, "tablet", "default", "U_0905");

  it("names arm (b): rule logic against the existing U_ identity", () => {
    expect(vm.form).toBe("U_");
    expect(vm.criterion.criterion).toBe("b");
  });

  it("carries BOTH productions: the rule's output and the marked decode fall-through", () => {
    const row = vm.productionRows[0];
    const texts = row?.production.productions.filter((e) => e.output.kind === "text");
    expect(texts.map((e) => (e.output.kind === "text" ? e.output.text : ""))).toContain("ा");
    const fallThrough = row?.production.productions.find((e) => e.viaFallback === true);
    expect(fallThrough?.output).toEqual({ kind: "text", text: "अ" });
    expect(fallThrough?.condition).toBe("no rule matches");
  });
});

describe("buildKeyIdentityViewModel — basic_kbdus T_0031 is a layer-switch key", () => {
  // The fixture's T_0031 carries nextlayer "default": its only production is
  // the switch itself, so the criterion is arm (e) (non-producing role set) —
  // NOT the FR-009 dead key it is sometimes mistaken for.
  const fixture = loadFixture("basic_kbdus");
  const vm = build(fixture, "tablet", "symbol", "T_0031");

  it("names arm (e) and shows the layer switch as the production", () => {
    expect(vm.criterion.criterion).toBe("e");
    const row = vm.productionRows[0];
    expect(row?.production.productions[0]?.output).toEqual({
      kind: "layerSwitch",
      layerId: "default",
    });
  });
});

describe("buildKeyIdentityViewModel — dead T_ key (FR-009)", () => {
  const { ir } = parseKmn(
    [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'Dead Key Test'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_A] > 'a'",
      "",
    ].join("\n"),
    "dead_key_test",
  );
  const layout: TouchLayoutIR = {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [{ id: 1, keys: [{ nodeId: "k-dead", id: "T_0041", text: "A" }] }],
          },
        ],
      },
    ],
  };
  ir.touchLayout = layout;
  const vm = buildKeyIdentityViewModel({
    ir,
    ruleIndex: buildTouchKeyRuleIndex(ir),
    layout,
    platformId: "tablet",
    layerId: "default",
    key: { nodeId: "k-dead", id: "T_0041", text: "A" },
  });

  it("names FR-009, not a frame-class arm", () => {
    expect(vm.criterion.criterion).toBe("FR-009");
    expect(vm.productionRows).toHaveLength(1);
    expect(vm.productionRows[0]?.production.source).toBe("none");
  });
});

describe("buildKeyIdentityViewModel — recorded decisions win", () => {
  const fixture = loadFixture("sil_cameroon_qwerty");
  const decision: KeyIdentityDecision = {
    recordId: "decision:sever:T_0300",
    keyRef: "tablet:default:T_0300",
    action: "severed",
    criterion: "FR-008",
    track: "adapt",
    proposer: "criteria",
    authorAnswer: "accepted",
    hostSet: ["US"],
    recordedAt: 1_700_000_000_000,
    supersedes: null,
  };
  const vm = build(fixture, "tablet", "default", "T_0300", { decisions: [decision] });

  it("shows the recorded criterion and provenance, not a fresh derivation", () => {
    expect(vm.criterion.source).toBe("recorded");
    expect(vm.criterion.criterion).toBe("FR-008");
    expect(vm.criterion.action).toBe("severed");
    expect(vm.decisions).toEqual([decision]);
  });
});

describe("buildKeyIdentityViewModel — FR-029 re-link offer", () => {
  const fixture = loadFixture("sil_cameroon_qwerty");
  // The T_030D rule shape (bare + SHIFT producers, both guarded) carried by
  // K_2, severed onto the fresh id T_0310. The shape matters: the rules cover
  // state 0 AND SHIFT, the only states K_2 produces in — a shape covered only
  // in state 0 (T_0300's) leaves SHIFT to the K_ fallback, arm 0 fails there,
  // and no offer may be made (see the negative test below).
  const kmn = fs.readFileSync(
    path.join(FIXTURE_ROOT, "sil_cameroon_qwerty", "sil_cameroon_qwerty.kmn"),
    "utf8",
  );
  const severedKmn = kmn.replaceAll("[SHIFT T_030D]", "[SHIFT K_2]").replaceAll("[T_030D]", "[K_2]");
  const layoutWithK2 = JSON.parse(JSON.stringify(fixture.layout)) as TouchLayoutIR;
  for (const platform of layoutWithK2.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (key.id === "T_030D") key.id = "K_2";
        }
      }
    }
  }
  const { ir } = parseKmn(severedKmn, "cameroon_shape");
  ir.touchLayout = layoutWithK2;
  const result = severTouchKey(ir, layoutWithK2, buildTouchKeyRuleIndex(ir), {
    sourceId: "K_2",
    targetId: "T_0310",
    platformId: "tablet",
    anchorLayerId: "default",
    track: "creation",
    recordedAt: 1_700_000_000_000,
  });

  it("the transplant completed (fixture sanity)", () => {
    expect(result.record.outcome).toBe("completed");
  });

  const severedVm = buildKeyIdentityViewModel({
    ir: result.ir,
    ruleIndex: buildTouchKeyRuleIndex(result.ir),
    layout: result.layout,
    platformId: "tablet",
    layerId: "default",
    key: findKey(result.layout, "tablet", "default", "T_0310"),
    decisions: [result.decision],
    transplants: [result.record],
  });

  it("offers re-link while the severed key still behaves exactly as K_2 does", () => {
    expect(severedVm.relink?.sourceId).toBe("K_2");
    expect(severedVm.relink?.record.recordId).toBe(result.record.recordId);
    expect(severedVm.transplant?.outcome).toBe("completed");
  });

  it("withdraws the offer once a recorded re-link has consumed the transplant", () => {
    const relinked: KeyIdentityDecision = {
      recordId: `decision:relink:${result.record.recordId}`,
      keyRef: "tablet:default:T_0310",
      action: "relinked",
      criterion: "FR-029",
      track: "creation",
      proposer: "author",
      hostSet: ["US"],
      recordedAt: 1_700_000_100_000,
      supersedes: null,
    };
    const vm = buildKeyIdentityViewModel({
      ir: result.ir,
      ruleIndex: buildTouchKeyRuleIndex(result.ir),
      layout: result.layout,
      platformId: "tablet",
      layerId: "default",
      key: findKey(result.layout, "tablet", "default", "T_0310"),
      decisions: [result.decision, relinked],
      transplants: [result.record],
    });
    expect(vm.relink).toBeUndefined();
  });

  it("withdraws the offer when the severed key's behaviour has diverged from K_2", () => {
    // The severed id carrying an extra rule the source lacks: T_0310 gains an
    // 'X' production K_2 does not have, so arm 0 no longer holds.
    const divergedText =
      severedKmn.replaceAll("[SHIFT K_2]", "[SHIFT T_0310]").replaceAll("[K_2]", "[T_0310]") +
      "\n+ [T_0310] > 'X'\n";
    const { ir: divergedIr } = parseKmn(divergedText, "diverged");
    divergedIr.touchLayout = result.layout;
    const vm = buildKeyIdentityViewModel({
      ir: divergedIr,
      ruleIndex: buildTouchKeyRuleIndex(divergedIr),
      layout: result.layout,
      platformId: "tablet",
      layerId: "default",
      key: findKey(result.layout, "tablet", "default", "T_0310"),
      transplants: [result.record],
    });
    expect(vm.relink).toBeUndefined();
  });

  it("makes NO offer when a fallback state is uncovered (T_0300 shape severed off K_1)", () => {
    // K_1's rules (T_0300's shape) cover state 0 only; on the shift layer the
    // physical key still produces "!" via the K_ fallback while the severed
    // key produces nothing — behaviour differs, so arm 0 does not hold.
    const shapeKmn = kmn.replaceAll("[T_0300]", "[K_1]");
    const { ir: shapeIr } = parseKmn(shapeKmn, "cameroon_shape");
    shapeIr.touchLayout = fixture.layout;
    const sev = severTouchKey(shapeIr, fixture.layout, buildTouchKeyRuleIndex(shapeIr), {
      sourceId: "K_1",
      targetId: "T_0301",
      platformId: "tablet",
      anchorLayerId: "default",
      recordedAt: 1_700_000_000_000,
    });
    expect(sev.record.outcome).toBe("completed");
    const vm = buildKeyIdentityViewModel({
      ir: sev.ir,
      ruleIndex: buildTouchKeyRuleIndex(sev.ir),
      layout: sev.layout,
      platformId: "tablet",
      layerId: "default",
      key: findKey(sev.layout, "tablet", "default", "T_0301"),
      transplants: [sev.record],
    });
    expect(vm.relink).toBeUndefined();
  });
});
