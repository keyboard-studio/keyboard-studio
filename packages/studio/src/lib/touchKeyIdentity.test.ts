// Spec 104 T015/T016 — touchKeyIdentity lib tests.
//
// Covers: dead-key row derivation over the contracts scan, the FR-009
// guard-aware default, append-only record semantics (supersede, never
// edit), repair application (ops + mint-and-rule), the SC-004 decline
// guarantee (identity + rules byte-identical after a declined choice), and
// the FR-016 refusal plan for the inline severance choice.

import { describe, expect, it } from "vitest";
import type {
  KeyboardIR,
  RepairProposal,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  bindingsForKeyId,
  findDeadTouchKeys,
  buildTouchKeyRuleIndex,
} from "@keyboard-studio/contracts";
import {
  applyGuardSynthesis,
  ensureTouchKeyRule,
  parseKmn,
  planGuardSynthesis,
} from "@keyboard-studio/engine";
import { deriveRuleAdditions } from "../survey/rules/ruleAdditions.ts";
import type { TouchKeyIdentityRecords } from "../stores/workingCopyStore.ts";
import { EMPTY_TOUCH_KEY_IDENTITY } from "../stores/workingCopyStore.ts";
import {
  appendIdentityChoiceState,
  appendIdentityDecision,
  appendRepairProposal,
  appendTransplantRecord,
  deadKeyRepairDefault,
  deriveRepairRows,
  identityChoiceFingerprint,
  identityDecisionForAddress,
  identityTrackFor,
  latestLive,
  mergeSeveranceWithSynthesis,
  mintRecordId,
  mintRuleForRepair,
  planInlineSeverance,
  repairApplyOps,
  repairOutcomeFor,
  standingIdentityChoice,
} from "./touchKeyIdentity.ts";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'w3-identity-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
+ [K_A] > 'a'
`;

function irOf(kmn: string = BASE_KMN): KeyboardIR {
  return parseKmn(kmn, "w3_identity_test").ir;
}

/** Tablet layout: a live K_A, a dead T_0031 ("1"), a dead T_0300 (mark). */
function layoutOf(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "k1", id: "K_A", text: "a" },
                  { nodeId: "k2", id: "T_0031", text: "1" },
                  { nodeId: "k3", id: "T_0300", text: "◌̀" },
                ],
              },
            ],
          },
          {
            id: "symbol",
            rows: [
              {
                keys: [{ nodeId: "k4", id: "T_0031", text: "1" }],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [],
  } as unknown as TouchLayoutIR;
}

function recordsWith(partial: Partial<TouchKeyIdentityRecords>): TouchKeyIdentityRecords {
  return { ...EMPTY_TOUCH_KEY_IDENTITY, ...partial };
}

describe("identityTrackFor", () => {
  it("maps instantiation modes onto the contracts track vocabulary", () => {
    expect(identityTrackFor("adapt-existing")).toBe("adapt");
    expect(identityTrackFor("new-from-base")).toBe("copy");
    expect(identityTrackFor(null)).toBe("creation");
  });
});

describe("deadKeyRepairDefault (FR-009)", () => {
  it("converts when the suffix parses as the keycap's character", () => {
    const d = deadKeyRepairDefault({
      keyId: "T_0031",
      keycapChar: "1",
      convertToId: "U_0031",
      guardSwallowInForce: false,
    });
    expect(d.defaultAction).toBe("convert-to-u");
    expect(d.options).toEqual(["convert-to-u", "mint-and-rule", "blank"]);
  });

  it("a swallow guard in force moves a mark's default to mint-and-rule", () => {
    const d = deadKeyRepairDefault({
      keyId: "T_0300",
      keycapChar: "̀",
      convertToId: "U_0300",
      guardSwallowInForce: true,
    });
    expect(d.defaultAction).toBe("mint-and-rule");
    // Without the guard, the same mark converts.
    expect(
      deadKeyRepairDefault({
        keyId: "T_0300",
        keycapChar: "̀",
        convertToId: "U_0300",
        guardSwallowInForce: false,
      }).defaultAction,
    ).toBe("convert-to-u");
  });

  it("falls to blank when nothing says what the key should type", () => {
    const d = deadKeyRepairDefault({
      keyId: "T_FOO",
      keycapChar: undefined,
      convertToId: undefined,
      guardSwallowInForce: false,
    });
    expect(d.defaultAction).toBe("blank");
    expect(d.options).toEqual(["blank"]);
  });

  it("mints a rule from keycap evidence when the suffix cannot convert", () => {
    const d = deadKeyRepairDefault({
      keyId: "T_CAM",
      keycapChar: "₣",
      convertToId: undefined,
      guardSwallowInForce: false,
    });
    expect(d.defaultAction).toBe("mint-and-rule");
  });
});

describe("deriveRepairRows", () => {
  it("derives one row per dead id with occurrences across layers", () => {
    const rows = deriveRepairRows({ ir: irOf(), layout: layoutOf(), records: null });
    expect(rows.map((r) => r.keyId).sort()).toEqual(["T_0031", "T_0300"]);
    const digit = rows.find((r) => r.keyId === "T_0031")!;
    expect(digit.layerId).toBe("default");
    expect(digit.layerIds).toEqual(["default", "symbol"]);
    expect(digit.occurrences).toHaveLength(2);
    expect(digit.defaultAction).toBe("convert-to-u");
    expect(digit.convertToId).toBe("U_0031");
    const mark = rows.find((r) => r.keyId === "T_0300")!;
    // #2374: with no box map the mark takes the unticked default — guarded —
    // so the repair default is mint-and-rule, not convert-to-u.
    expect(mark.defaultAction).toBe("mint-and-rule");
  });

  it("the start-of-line box changes the mark row's default", () => {
    const ticked = deriveRepairRows({
      ir: irOf(),
      layout: layoutOf(),
      records: null,
      bareMarkAllowedByMark: { "̀": true },
    });
    expect(ticked.find((r) => r.keyId === "T_0300")!.defaultAction).toBe("convert-to-u");
    expect(ticked.find((r) => r.keyId === "T_0031")!.defaultAction).toBe("convert-to-u");
    // Unticked box: the mark row's default is mint-and-rule (guarded T_).
    const unticked = deriveRepairRows({
      ir: irOf(),
      layout: layoutOf(),
      records: null,
      bareMarkAllowedByMark: { "̀": false },
    });
    expect(unticked.find((r) => r.keyId === "T_0300")!.defaultAction).toBe("mint-and-rule");
    expect(unticked.find((r) => r.keyId === "T_0031")!.defaultAction).toBe("convert-to-u");
  });

  it("a ruled T_ key derives no row", () => {
    const kmn = BASE_KMN.replace(
      "+ [K_A] > 'a'",
      "+ [K_A] > 'a'\n+ [T_0031] > '1'",
    );
    const rows = deriveRepairRows({ ir: irOf(kmn), layout: layoutOf(), records: null });
    expect(rows.map((r) => r.keyId)).toEqual(["T_0300"]);
  });

  /** layoutOf() with the convert-to-u repair applied: T_0031 → U_0031. */
  function layoutAfterConvert(): TouchLayoutIR {
    const layout = layoutOf();
    for (const platform of layout.platforms) {
      for (const layer of platform.layers) {
        for (const row of layer.rows) {
          for (const key of row.keys) {
            if (key.id === "T_0031") key.id = "U_0031";
          }
        }
      }
    }
    return layout;
  }

  function repairRecord(outcome: "applied" | "declined"): TouchKeyIdentityRecords {
    return recordsWith({
      repairProposals: [
        {
          recordId: "repair:tablet:default:T_0031:1",
          keyRef: "tablet:default:T_0031",
          defaultAction: "convert-to-u",
          options: ["convert-to-u", "mint-and-rule", "blank"],
          outcome,
          recordedAt: 1760000000000,
          supersedes: null,
        },
      ],
    });
  }

  it("an applied repair's row stays visible-and-answered after the rename resolves the finding", () => {
    // The rename removes T_0031 from findDeadTouchKeys; the row must be
    // re-derived from the record so the recorded outcome still renders
    // (FR-017's visible-and-answered contract).
    const rows = deriveRepairRows({
      ir: irOf(),
      layout: layoutAfterConvert(),
      records: repairRecord("applied"),
    });
    const answered = rows.find((r) => r.keyId === "T_0031");
    expect(answered).toBeDefined();
    expect(answered!.keyRef).toBe("tablet:default:T_0031");
    expect(answered!.layerId).toBe("default");
    expect(answered!.layerIds).toEqual(["default", "symbol"]);
    expect(answered!.defaultAction).toBe("convert-to-u");
    expect(repairOutcomeFor(repairRecord("applied"), answered!.keyRef)?.outcome).toBe("applied");
  });

  it("a declined repair keeps exactly one row — the live finding's, not a synthesized duplicate", () => {
    const rows = deriveRepairRows({
      ir: irOf(),
      layout: layoutOf(),
      records: repairRecord("declined"),
    });
    expect(rows.filter((r) => r.keyId === "T_0031")).toHaveLength(1);
  });

  it("an answered record for a key deleted from the layout derives no row", () => {
    const layout = layoutAfterConvert();
    for (const platform of layout.platforms) {
      for (const layer of platform.layers) {
        for (const row of layer.rows) {
          row.keys = row.keys.filter((k) => k.id !== "U_0031");
        }
      }
    }
    const rows = deriveRepairRows({
      ir: irOf(),
      layout,
      records: repairRecord("applied"),
    });
    expect(rows.map((r) => r.keyId)).not.toContain("T_0031");
  });
});

describe("repair application", () => {
  it("convert-to-u emits one rename op per occurrence", () => {
    const rows = deriveRepairRows({ ir: irOf(), layout: layoutOf(), records: null });
    const digit = rows.find((r) => r.keyId === "T_0031")!;
    const ops = repairApplyOps(digit, "convert-to-u");
    expect(ops).toEqual([
      { kind: "rename", address: "tablet:default:T_0031", toId: "U_0031" },
      { kind: "rename", address: "tablet:symbol:T_0031", toId: "U_0031" },
    ]);
  });

  it("blank emits suppress ops with the sp-10 T_BLANK sentinel", () => {
    const rows = deriveRepairRows({ ir: irOf(), layout: layoutOf(), records: null });
    const mark = rows.find((r) => r.keyId === "T_0300")!;
    expect(repairApplyOps(mark, "blank")).toEqual([
      {
        kind: "suppress",
        address: "tablet:default:T_0300",
        spClass: 10,
        sentinelId: "T_BLANK",
      },
    ]);
  });

  it("a dead sk subkey repairs through host-addressed subkey ops", () => {
    const layout = {
      platforms: [
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    {
                      nodeId: "k1",
                      id: "K_A",
                      text: "a",
                      sk: [{ nodeId: "k2", id: "T_0031", text: "1" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    } as unknown as TouchLayoutIR;
    const rows = deriveRepairRows({ ir: irOf(), layout, records: null });
    const digit = rows.find((r) => r.keyId === "T_0031")!;
    expect(digit).toBeDefined();
    expect(repairApplyOps(digit, "convert-to-u")).toEqual([
      {
        kind: "setSubKey",
        address: "tablet:default:K_A",
        sub: { kind: "sk", id: "T_0031" },
        fields: { id: "U_0031" },
      },
    ]);
    expect(repairApplyOps(digit, "blank")).toEqual([
      {
        kind: "removeSubKey",
        address: "tablet:default:K_A",
        sub: { kind: "sk", id: "T_0031" },
      },
    ]);
  });

  it("mint-and-rule writes a producing rule and the key is no longer dead", () => {
    const ir = irOf();
    const rows = deriveRepairRows({ ir, layout: layoutOf(), records: null });
    const mark = rows.find((r) => r.keyId === "T_0300")!;
    const outcome = mintRuleForRepair({ ir, row: mark });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const remaining = findDeadTouchKeys({
      ir: outcome.ir,
      layout: layoutOf(),
      ruleIndex: buildTouchKeyRuleIndex(outcome.ir),
    });
    expect(remaining.map((f) => String(f.fields.keyId))).toEqual(["T_0031"]);
  });
});

describe("record semantics", () => {
  const proposal = (outcome: RepairProposal["outcome"]): Omit<RepairProposal, "supersedes"> => ({
    recordId: mintRecordId(null, "repair", "tablet:default:T_0031"),
    keyRef: "tablet:default:T_0031",
    defaultAction: "convert-to-u",
    options: ["convert-to-u", "mint-and-rule", "blank"],
    outcome,
    recordedAt: 1760000000000,
  });

  it("appends supersede; the latest live record governs", () => {
    let records = appendRepairProposal(null, proposal("declined"));
    expect(repairOutcomeFor(records, "tablet:default:T_0031")?.outcome).toBe("declined");
    records = appendRepairProposal(records, {
      ...proposal("applied"),
      recordId: "repair:tablet:default:T_0031:2",
    });
    expect(repairOutcomeFor(records, "tablet:default:T_0031")?.outcome).toBe("applied");
    expect(records.repairProposals).toHaveLength(2);
    expect(records.repairProposals[1]!.supersedes).toBe(records.repairProposals[0]!.recordId);
  });

  it("identity decisions append per (key, action) and stay readable", () => {
    const records = appendIdentityDecision(null, {
      recordId: "decision:tablet:default:K_1:1",
      keyRef: "tablet:default:K_1",
      action: "kept-by-choice",
      criterion: "FR-011",
      track: "adapt",
      proposer: "author",
      authorAnswer: "keep-the-link",
      hostSet: ["US"],
      recordedAt: 1760000000000,
    });
    const live = latestLive(records.identityDecisions, (d) => d.keyRef === "tablet:default:K_1");
    expect(live?.action).toBe("kept-by-choice");
  });

  it("identityDecisionForAddress resolves a severed key through its transplant record", () => {
    let records = appendIdentityDecision(null, {
      recordId: "decision:tablet:default:K_1:1",
      keyRef: "tablet:default:K_1",
      action: "severed",
      criterion: "FR-008",
      track: "adapt",
      proposer: "author",
      authorAnswer: "sever-the-link",
      hostSet: ["US"],
      recordedAt: 1760000000000,
    });
    records = appendTransplantRecord(records, {
      recordId: "transplant:K_1->T_00A1",
      sourceId: "K_1",
      targetId: "T_00A1",
      layersAffected: ["default"],
      clonedRuleNodeIds: [],
      outcome: "completed",
      recordedAt: 1760000000000,
      supersedes: null,
    });
    expect(identityDecisionForAddress(records, "tablet:default:T_00A1")?.action).toBe("severed");
    expect(identityDecisionForAddress(records, "tablet:default:K_1")?.action).toBe("severed");
    expect(identityDecisionForAddress(records, "tablet:default:K_9")).toBeUndefined();
  });
});

describe("SC-004 — decline leaves identity + rules byte-identical", () => {
  it("serialised layout and rules are unchanged after declining every row", () => {
    const ir = irOf();
    const layout = layoutOf();
    const beforeIr = JSON.stringify(ir);
    const beforeLayout = JSON.stringify(layout);

    const rows = deriveRepairRows({ ir, layout, records: null });
    expect(rows.length).toBeGreaterThan(0);

    // The decline path: record the outcome, apply NOTHING.
    let records: TouchKeyIdentityRecords | null = null;
    for (const row of rows) {
      records = appendRepairProposal(records, {
        recordId: mintRecordId(records, "repair", row.keyRef),
        keyRef: row.keyRef,
        defaultAction: row.defaultAction,
        options: [...row.options],
        outcome: "declined",
        recordedAt: 1760000000000,
      });
    }

    expect(JSON.stringify(ir)).toBe(beforeIr);
    expect(JSON.stringify(layout)).toBe(beforeLayout);

    // The rows still derive (the keys are still dead) but every one carries
    // its recorded decline — visible-and-answered, not re-presented as new.
    const rederived = deriveRepairRows({ ir, layout, records });
    expect(rederived.map((r) => r.keyRef)).toEqual(rows.map((r) => r.keyRef));
    for (const row of rederived) {
      expect(repairOutcomeFor(records, row.keyRef)?.outcome).toBe("declined");
    }
  });
});

describe("planInlineSeverance (FR-016)", () => {
  /** Layout whose default layer actually carries the T_FOO key. */
  function fooLayout(): TouchLayoutIR {
    return {
      platforms: [
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    { nodeId: "k1", id: "K_A", text: "a" },
                    { nodeId: "k2", id: "T_FOO", text: "x" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    } as unknown as TouchLayoutIR;
  }

  it("a solely-bound key transplants cleanly (no refusal)", () => {
    const kmn = BASE_KMN.replace("+ [K_A] > 'a'", "+ [T_FOO] > 'x'");
    const plan = planInlineSeverance({
      ir: irOf(kmn),
      layout: fooLayout(),
      platformId: "tablet",
      anchorLayerId: "default",
      sourceId: "T_FOO",
      targetId: "T_BAR",
      track: "adapt",
    });
    expect(plan.speculative.record.outcome).toBe("completed");
    expect(plan.refusalBinding).toBeUndefined();
  });

  it("a binding shared through a store fan refuses and names the binding", () => {
    // The fv_southern_carrier shape: the key is reachable only through a
    // store listing shared with its siblings — no verbatim transplant
    // exists, so severance refuses (the FR-016 collapse input).
    const kmn = `store(&VERSION) '10.0'
store(&NAME) 'w3-fan-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

store(fanHkeys) [T_H] [T_HI] [T_HU]
store(fanH) "ᐸᐱᐲ"

+ any(fanHkeys) > index(fanH,1)
`;
    const fanLayout = {
      platforms: [
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [
                {
                  keys: [
                    { nodeId: "k1", id: "T_H", text: "ᐸ" },
                    { nodeId: "k2", id: "T_HI", text: "ᐱ" },
                    { nodeId: "k3", id: "T_HU", text: "ᐲ" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      nodeIds: [],
    } as unknown as TouchLayoutIR;
    const plan = planInlineSeverance({
      ir: irOf(kmn),
      layout: fanLayout,
      platformId: "tablet",
      anchorLayerId: "default",
      sourceId: "T_H",
      targetId: "T_HX",
      track: "adapt",
    });
    expect(plan.speculative.record.outcome).toBe("refused");
    expect(plan.refusalBinding).toBeDefined();
    expect(plan.refusalBinding).toContain("fanHkeys");
  });
});

describe("mergeSeveranceWithSynthesis (T016 commit composition)", () => {
  const MERGE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'w3-merge-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
+ [K_1] > '1'
+ [SHIFT K_1] > '!'
`;

  function mergeLayout(): TouchLayoutIR {
    return {
      platforms: [
        {
          id: "tablet",
          layers: [
            {
              id: "default",
              rows: [{ keys: [{ nodeId: "k1", id: "K_1", text: "1" }] }],
            },
            {
              id: "shift",
              rows: [{ keys: [{ nodeId: "k2", id: "K_1", text: "!" }] }],
            },
          ],
        },
      ],
      nodeIds: [],
    } as unknown as TouchLayoutIR;
  }

  /** Produced text per combo word-set for one key id in an IR. */
  function productionsByCombo(ir: KeyboardIR, keyId: string): Map<string, string[]> {
    const index = buildTouchKeyRuleIndex(ir);
    const out = new Map<string, string[]>();
    for (const b of bindingsForKeyId(index, keyId)) {
      if (b.role !== "produces") continue;
      const key = b.modifiers.join(" ");
      out.set(key, [...(out.get(key) ?? []), b.produced.join("")]);
    }
    return out;
  }

  it("the author's synthesised rule supersedes the anchor-combo clone; other clones stand", () => {
    const ir = irOf(MERGE_KMN);
    const plan = planInlineSeverance({
      ir,
      layout: mergeLayout(),
      platformId: "tablet",
      anchorLayerId: "default",
      sourceId: "K_1",
      targetId: "T_00A1",
      track: "adapt",
      proposer: "author",
      authorAnswer: "sever-the-link",
    });
    expect(plan.speculative.record.outcome).toBe("completed");

    // The panel's synthesis for the same edit: T_00A1 types '¡' at base.
    const synth = ensureTouchKeyRule(ir, buildTouchKeyRuleIndex(ir), {
      keyId: "T_00A1",
      combo: [],
      outputText: "¡",
    });
    expect(synth.ok).toBe(true);
    if (!synth.ok) return;

    const merged = mergeSeveranceWithSynthesis({
      plan: plan.speculative,
      baseIr: ir,
      nextIr: synth.ir,
      anchorLayerId: "default",
    });
    const target = productionsByCombo(merged, "T_00A1");
    // Base combo: ONLY the author's '¡' — the cloned '1' rule is gone.
    expect(target.get("")).toEqual(["¡"]);
    // Shift combo: the transplanted clone stands — '!' keeps typing.
    expect(target.get("SHIFT")).toEqual(["!"]);
    // The source key's own rules are untouched (both halves keep typing).
    const source = productionsByCombo(merged, "K_1");
    expect(source.get("")).toEqual(["1"]);
    expect(source.get("SHIFT")).toEqual(["!"]);
  });

  it("a U_ target on the decode path drops the anchor-combo clone so the decode shows", () => {
    const ir = irOf(MERGE_KMN);
    const plan = planInlineSeverance({
      ir,
      layout: mergeLayout(),
      platformId: "tablet",
      anchorLayerId: "default",
      sourceId: "K_1",
      targetId: "U_00A1",
      track: "adapt",
    });
    expect(plan.speculative.record.outcome).toBe("completed");
    const merged = mergeSeveranceWithSynthesis({
      plan: plan.speculative,
      baseIr: ir,
      nextIr: undefined,
      anchorLayerId: "default",
    });
    const target = productionsByCombo(merged, "U_00A1");
    // No base-combo rule: U_00A1 falls to its decode ('¡') at the anchor.
    expect(target.get("")).toBeUndefined();
    // The shift clone stands.
    expect(target.get("SHIFT")).toEqual(["!"]);
  });

  it("stamps the composed delta (clones, guard pair, guard store) for the projection's additions seam", () => {
    const ir = irOf(MERGE_KMN);
    const plan = planInlineSeverance({
      ir,
      layout: mergeLayout(),
      platformId: "tablet",
      anchorLayerId: "default",
      sourceId: "K_1",
      targetId: "T_0301",
      track: "copy",
    });
    expect(plan.speculative.record.outcome).toBe("completed");

    // The panel's guard synthesis for the same edit (walk 1's shape).
    const index = buildTouchKeyRuleIndex(ir);
    const gplan = planGuardSynthesis(ir, index, "T_0301", [], "́", {
      repertoire: [" ", "1", "."],
      opaqueAcknowledged: true,
    });
    expect(gplan.ok).toBe(true);
    if (!gplan.ok) return;
    const applied = applyGuardSynthesis(ir, index, gplan, "T_0301", "́", {
      opaqueAcknowledged: true,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const merged = mergeSeveranceWithSynthesis({
      plan: plan.speculative,
      baseIr: ir,
      nextIr: applied.ir,
      anchorLayerId: "default",
    });

    const baseRuleIds = new Set(ir.groups.flatMap((g) => g.rules.map((r) => r.nodeId)));
    const baseStoreIds = new Set(ir.stores.map((s) => s.nodeId));
    // Every rule the composition added over the base carries the marker —
    // the standing SHIFT clone and the synthesized guard + producing rules.
    const addedRules = merged.groups.flatMap((g) =>
      g.rules.filter((r) => !baseRuleIds.has(r.nodeId)),
    );
    expect(addedRules.length).toBeGreaterThan(0);
    for (const r of addedRules) expect(r.rulesStepAdded).toBe(true);
    // Base rules are never stamped.
    for (const g of merged.groups) {
      for (const r of g.rules) {
        if (baseRuleIds.has(r.nodeId)) expect(r.rulesStepAdded).toBeUndefined();
      }
    }
    // The minted guard store is stamped too, so it splices in beside its rule.
    const addedStores = merged.stores.filter((s) => !baseStoreIds.has(s.nodeId));
    expect(addedStores.length).toBe(1);
    expect(addedStores[0]?.rulesStepAdded).toBe(true);

    // And the seam actually collects the composition: guard + producing +
    // the standing clone are all additions over the base.
    const additions = deriveRuleAdditions(merged, ir);
    const addedIds = new Set(additions.groups.flatMap((g) => g.added.map((r) => r.nodeId)));
    for (const r of addedRules) expect(addedIds.has(r.nodeId)).toBe(true);
    expect(additions.stores.map((s) => s.nodeId)).toEqual(
      addedStores.map((s) => s.nodeId),
    );
  });
});

describe("FR-017 decline suppression on the inline assign path", () => {
  const ADDRESS = "tablet:default:K_A";

  /** Records as handleIdentityChoiceConfirm leaves them after a "keep". */
  function declinedRecords(ir: KeyboardIR): TouchKeyIdentityRecords {
    let records = appendIdentityDecision(null, {
      recordId: "decision:keep:1",
      keyRef: ADDRESS,
      action: "kept-by-choice",
      criterion: "FR-011",
      track: "adapt",
      proposer: "author",
      authorAnswer: "keep-the-link",
      hostSet: ["US"],
      recordedAt: 1760000000000,
    });
    records = appendIdentityChoiceState(records, {
      keyRef: ADDRESS,
      sourceId: "K_A",
      targetId: "T_FOO",
      fingerprint: identityChoiceFingerprint(ir, "K_A"),
      decisionRecordId: "decision:keep:1",
      recordedAt: 1760000000000,
    });
    return records;
  }

  it("decline once → the identical edit is not re-presented", () => {
    const ir = irOf();
    const standing = standingIdentityChoice(declinedRecords(ir), {
      keyRef: ADDRESS,
      sourceId: "K_A",
      targetId: "T_FOO",
      ir,
    });
    expect(standing?.decisionRecordId).toBe("decision:keep:1");
  });

  it("underlying state change (a bound rule edited) → re-presented", () => {
    const before = irOf();
    const records = declinedRecords(before);
    const after = irOf(BASE_KMN.replace("> 'a'", "> 'z'"));
    expect(
      standingIdentityChoice(records, {
        keyRef: ADDRESS,
        sourceId: "K_A",
        targetId: "T_FOO",
        ir: after,
      }),
    ).toBeUndefined();
  });

  it("underlying state change (a binding added) → re-presented", () => {
    const before = irOf();
    const records = declinedRecords(before);
    const after = irOf(BASE_KMN + "\n+ [SHIFT K_A] > 'A'\n");
    expect(
      standingIdentityChoice(records, {
        keyRef: ADDRESS,
        sourceId: "K_A",
        targetId: "T_FOO",
        ir: after,
      }),
    ).toBeUndefined();
  });

  it("a different target is a different question → re-presented", () => {
    const ir = irOf();
    expect(
      standingIdentityChoice(declinedRecords(ir), {
        keyRef: ADDRESS,
        sourceId: "K_A",
        targetId: "T_BAR",
        ir,
      }),
    ).toBeUndefined();
  });

  it("a newer decision for the key retires the suppression", () => {
    const ir = irOf();
    let records = declinedRecords(ir);
    records = appendIdentityDecision(records, {
      recordId: "decision:sever:2",
      keyRef: ADDRESS,
      action: "severed",
      criterion: "FR-011",
      track: "adapt",
      proposer: "author",
      authorAnswer: "sever-the-link",
      hostSet: ["US"],
      recordedAt: 1760000001000,
    });
    expect(
      standingIdentityChoice(records, {
        keyRef: ADDRESS,
        sourceId: "K_A",
        targetId: "T_FOO",
        ir,
      }),
    ).toBeUndefined();
  });

  it("no recorded answer → nothing stands", () => {
    const ir = irOf();
    expect(
      standingIdentityChoice(null, {
        keyRef: ADDRESS,
        sourceId: "K_A",
        targetId: "T_FOO",
        ir,
      }),
    ).toBeUndefined();
  });
});
