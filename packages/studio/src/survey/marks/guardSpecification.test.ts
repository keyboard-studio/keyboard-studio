// guardSpecification — spec 104 FR-013 / T013: the Track 2 seed detector
// (contracts rule-join signals only), the registry record round-trip, and
// the completion-report re-evaluation scan (US1 scenario 6).

import { beforeEach, describe, expect, it } from "vitest";
import type { IRRule, KeyboardIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeTouchKeyRuleJoinFixture } from "@keyboard-studio/contracts/fixtures";

import { useDecisionStore } from "../../stores/decisionStore.ts";
import { EMPTY_MARKS_VALUE, recordMarksTreatmentValue } from "./marksValue.ts";
import {
  detectImportedGuardBehaviour,
  effectiveGuardSpecification,
  findGuardReevaluationItems,
  getGuardSpecification,
  makeGuardSpecification,
  recordGuardAnswer,
} from "./guardSpecification.ts";

const GRAVE = "̀"; // U+0300 combining grave

function vkeyContext(name: string): IRRule["context"] {
  return [
    { kind: "any", storeRef: "diablock" },
    { kind: "raw", text: "+" },
    { kind: "vkey", name, modifiers: [] },
  ];
}

function guardRule(nodeId: string, keyId: string): IRRule {
  return { nodeId, context: vkeyContext(keyId), output: [{ kind: "raw", text: "context" }] };
}

function producingRule(nodeId: string, keyId: string, text: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: keyId, modifiers: [] }],
    output: [...text].map((value) => ({ kind: "char" as const, value })),
  };
}

let keyCounter = 0;
function key(id: string, text: string): TouchKeyIR {
  return { nodeId: `touchKey#${keyCounter++}`, id, text };
}

function irWith(keys: TouchKeyIR[], rules: IRRule[]): KeyboardIR {
  return makeTestIR({
    stores: [
      {
        nodeId: "store#diablock",
        name: "diablock",
        items: [{ kind: "char", value: " " }],
        isSystem: false,
      },
    ],
    groups: [{ nodeId: "group#main", name: "main", usingKeys: true, rules, readonly: false }],
    touchLayout: {
      platforms: [{ id: "phone", layers: [{ id: "default", rows: [{ keys }] }] }],
      nodeIds: [],
    },
  });
}

function guardedMarkIR(): KeyboardIR {
  return irWith(
    [key("T_0300", "◌̀")],
    [guardRule("rule#g", "T_0300"), producingRule("rule#p", "T_0300", GRAVE)],
  );
}

function unguardedMarkIR(): KeyboardIR {
  return irWith([key("T_0300", "◌̀")], [producingRule("rule#p", "T_0300", GRAVE)]);
}

describe("detectImportedGuardBehaviour — the Track 2 seed", () => {
  it("guarded T_ marks and no unguarded ones ⇒ swallow", () => {
    expect(detectImportedGuardBehaviour(guardedMarkIR())).toBe("swallow");
  });

  it("unguarded producing T_ marks and no guarded ones ⇒ emit", () => {
    expect(detectImportedGuardBehaviour(unguardedMarkIR())).toBe("emit");
  });

  it("a mixed population determines nothing", () => {
    const ir = irWith(
      [key("T_0300", "◌̀"), key("T_0301", "◌́")],
      [
        guardRule("rule#g", "T_0300"),
        producingRule("rule#p0", "T_0300", GRAVE),
        producingRule("rule#p1", "T_0301", "́"),
      ],
    );
    expect(detectImportedGuardBehaviour(ir)).toBeUndefined();
  });

  it("no T_ mark keys at all determines nothing", () => {
    const ir = irWith(
      [key("U_0300", "◌̀"), key("K_A", "a")],
      [producingRule("rule#p", "K_A", "a")],
    );
    expect(detectImportedGuardBehaviour(ir)).toBeUndefined();
  });

  it("the contracts join fixture (Cameroon-shaped guarded marks) seeds swallow", () => {
    expect(detectImportedGuardBehaviour(makeTouchKeyRuleJoinFixture())).toBe("swallow");
  });
});

describe("the registry record", () => {
  beforeEach(() => {
    useDecisionStore.getState().reset();
  });

  it("recordGuardAnswer writes a confirmed asked record, readable back", () => {
    const record = recordGuardAnswer("swallow");
    expect(record).toMatchObject({ behaviour: "swallow", origin: "asked", confirmed: true });
    expect(getGuardSpecification()).toEqual(record);
    expect(effectiveGuardSpecification(getGuardSpecification())).toEqual(record);
  });

  it("a later answer supersedes the earlier record", () => {
    const first = recordGuardAnswer("swallow");
    const second = recordGuardAnswer("emit");
    expect(second.supersedes).toBe(first.recordId);
    expect(getGuardSpecification()?.behaviour).toBe("emit");
  });

  it("a provisional seed is recorded but never effective", () => {
    const seed = makeGuardSpecification({
      behaviour: "swallow",
      origin: "seeded-from-import",
      confirmed: false,
    });
    expect(effectiveGuardSpecification(seed)).toBeUndefined();
    expect(effectiveGuardSpecification(null)).toBeUndefined();
    expect(effectiveGuardSpecification(undefined)).toBeUndefined();
  });

  it("confirming the seeded behaviour keeps the seeded origin", () => {
    // Seed through the same record path the marks step uses on entry.
    recordMarksTreatmentValue({
      ...EMPTY_MARKS_VALUE,
      guardSpecification: makeGuardSpecification({
        behaviour: "swallow",
        origin: "seeded-from-import",
        confirmed: false,
      }),
    });
    const confirmed = recordGuardAnswer("swallow");
    expect(confirmed.origin).toBe("seeded-from-import");
    expect(confirmed.confirmed).toBe(true);
    const changed = recordGuardAnswer("emit");
    expect(changed.origin).toBe("asked");
  });
});

describe("findGuardReevaluationItems — US1 scenario 6, reported never re-minted", () => {
  const swallow = makeGuardSpecification({ behaviour: "swallow", origin: "asked", confirmed: true });
  const emit = makeGuardSpecification({ behaviour: "emit", origin: "asked", confirmed: true });

  it("under swallow, a U_ mark key is reported as a unicode-form item", () => {
    const ir = irWith([key("U_0300", "◌̀")], []);
    expect(findGuardReevaluationItems(ir, swallow)).toEqual([
      {
        mark: GRAVE,
        keyId: "U_0300",
        platformId: "phone",
        layerId: "default",
        currentForm: "unicode",
        specBehaviour: "swallow",
      },
    ]);
  });

  it("under emit, a guarded T_ mark key is reported as a guarded-t item", () => {
    expect(findGuardReevaluationItems(guardedMarkIR(), emit)).toEqual([
      {
        mark: GRAVE,
        keyId: "T_0300",
        platformId: "phone",
        layerId: "default",
        currentForm: "guarded-t",
        specBehaviour: "emit",
      },
    ]);
  });

  it("forms that already agree with the specification are not reported", () => {
    expect(findGuardReevaluationItems(guardedMarkIR(), swallow)).toEqual([]);
    expect(findGuardReevaluationItems(irWith([key("U_0300", "◌̀")], []), emit)).toEqual([]);
    expect(findGuardReevaluationItems(unguardedMarkIR(), emit)).toEqual([]);
  });
});
