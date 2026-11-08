// kmnEdits module tests (spec 113 T049): the decision module that replays the Layout tab's
// edit log. apply replays through replayKmnEdits; with no value it composes from the recorded
// decision (the deadkeysDefined precedent); an empty log writes nothing.

import { describe, it, expect } from "vitest";
import { parseKmn, emitKmn } from "@keyboard-studio/engine";
import type { KmnEdit, KmnEditsValue } from "@keyboard-studio/contracts";
import kmnEdits from "./kmnEdits.ts";
import { galleryModules, layoutEditModules, questionRegistry, decisionIndex } from "../registry.ts";
import type { ApplyContext } from "../../types.ts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'kmn-edits-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [K_B] > 'b'
`;

const ir = () => parseKmn(KMN, "kmn-edits-test").ir;

const ENTRY: KmnEdit = {
  seq: 1,
  at: 0,
  op: "set-key",
  vkey: "K_A",
  layer: [],
  output: { kind: "text", text: "z" },
};
const VALUE: KmnEditsValue = { entries: [ENTRY] };

function ctx(base: ApplyContext["ir"], decisions: ApplyContext["decisions"] = {}): ApplyContext {
  return { ir: base, writes: kmnEdits.writes, decisions, currentHistoryEntryState: null };
}

describe("kmnEdits module contract", () => {
  it("provides kmn-edits, orders after the rule writers, writes groups plus the Code-tab surfaces", () => {
    expect(kmnEdits.provides).toEqual(["kmn-edits"]);
    expect(kmnEdits.requires).toEqual(["carved-layout", "deadkeys-defined", "rule-set", "physical-layout"]);
    expect(kmnEdits.writes.map((p) => p[0])).toEqual(["groups", "stores", "comments", "raw", "header"]);
    expect(kmnEdits.extract).toBeUndefined();
  });

  it("is registered for replay without becoming a wizard screen", () => {
    expect(layoutEditModules).toContain(kmnEdits);
    expect(Object.values(questionRegistry)).toContain(kmnEdits);
    expect(decisionIndex["kmn-edits"]).toBe(kmnEdits);
    // Not a gallery module: galleryModules.coverage.test.ts pins that list to the wizard's steps.
    expect(galleryModules).not.toContain(kmnEdits);
  });
});

describe("kmnEdits apply", () => {
  it("replays the entries into the IR, deterministically", () => {
    const base = ir();
    const first = kmnEdits.apply(VALUE, ctx(base));
    const second = kmnEdits.apply(VALUE, ctx(base));
    expect(first).toEqual(second);
    expect(first.ir).toBeDefined();
    expect(emitKmn({ ...base, ...first.ir })).toContain("U+007A");
  });

  it("with value undefined, composes from ctx.decisions", () => {
    const withRecord = ctx(ir(), { "kmn-edits": { id: "kmn-edits", value: VALUE, provenance: "asked" } });
    expect(kmnEdits.apply(undefined, withRecord).ir).toBeDefined();
    expect(kmnEdits.apply(undefined, ctx(ir()))).toEqual({});
  });

  it("an empty entry list, or no IR, writes nothing", () => {
    expect(kmnEdits.apply({ entries: [] }, ctx(ir()))).toEqual({});
    expect(kmnEdits.apply(VALUE, ctx(null))).toEqual({});
  });
});
