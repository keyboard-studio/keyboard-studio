// Tests for the append-only decision log (specs/053 T012, SC-002).
//
// The four properties the record's honesty rests on: entries only ever grow and
// never reorder across arbitrary navigation; a superseded entry stays
// retrievable; an identical revisit records nothing; and no existing entry's
// decision fields are ever rewritten in place.

import { beforeEach, describe, expect, it } from "vitest";
import {
  DECISION_RECORD_VERSION,
  type DecisionEntry,
  type DecisionPayload,
} from "@keyboard-studio/contracts";
import { parseDecisionRecord, serializeDecisionRecord } from "@keyboard-studio/engine";
import {
  chainTip,
  liveEntryForSlot,
  payloadsEqual,
  resetDecisionEntryIds,
  slotKeyOf,
  snapshotDecisionRecord,
  useDecisionLogStore,
} from "./decisionLogStore.ts";

const HAND_SET = { agency: "hand-set" } as const;

function answer(questionId: string, value: string): DecisionPayload {
  return { kind: "survey-answer", questionId, answerType: "text", value };
}

function carve(keysRemoved: number, sample: string[] = []): DecisionPayload {
  return {
    kind: "editor-action",
    actionType: "gallery_edit",
    summary: {
      keysRemoved,
      keysAdded: 0,
      mechanismsAssigned: 0,
      touchKeysAffected: 0,
      sample,
      sampleTruncated: false,
    },
  };
}

beforeEach(() => {
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
});

describe("append — monotonicity", () => {
  it("grows the entry list and never reorders it across an arbitrary walk", () => {
    const store = useDecisionLogStore.getState();
    // A realistic wander: forward, back to change an answer, forward again,
    // then re-enter an editor step.
    store.append({ stepId: "identity", payload: answer("q_name", "Hausa"), provenance: HAND_SET });
    store.append({ stepId: "identity", payload: answer("q_code", "ha"), provenance: HAND_SET });
    store.append({ stepId: "carve", payload: carve(3), provenance: HAND_SET });
    store.append({ stepId: "identity", payload: answer("q_name", "Hausa (Niger)"), provenance: HAND_SET });
    store.append({ stepId: "carve", payload: carve(5), provenance: HAND_SET });

    const ids = useDecisionLogStore.getState().record.entries.map((e) => e.entryId);
    expect(ids).toEqual(["d1", "d2", "d3", "d4", "d5"]);

    // One more decision appends at the end — it does not slot in beside the
    // entry it supersedes.
    store.append({ stepId: "identity", payload: answer("q_code", "hau"), provenance: HAND_SET });
    expect(useDecisionLogStore.getState().record.entries.map((e) => e.entryId))
      .toEqual(["d1", "d2", "d3", "d4", "d5", "d6"]);
  });

  it("keeps superseded entries retrievable with their original values", () => {
    const store = useDecisionLogStore.getState();
    const first = store.append({
      stepId: "identity",
      payload: answer("q_name", "Hausa"),
      provenance: HAND_SET,
    })!;
    const second = store.append({
      stepId: "identity",
      payload: answer("q_name", "Hausa (Niger)"),
      provenance: HAND_SET,
    })!;

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(2);
    const original = entries.find((e) => e.entryId === first)!;
    expect(original.payload).toEqual(answer("q_name", "Hausa"));
    expect(entries.find((e) => e.entryId === second)!.supersedes).toBe(first);
  });
});

describe("append — identical revisit is a no-op", () => {
  it("records nothing when the same survey value is re-recorded for the same slot", () => {
    const store = useDecisionLogStore.getState();
    expect(store.append({ stepId: "identity", payload: answer("q", "x"), provenance: HAND_SET }))
      .toBe("d1");
    expect(store.append({ stepId: "identity", payload: answer("q", "x"), provenance: HAND_SET }))
      .toBeNull();
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(1);
  });

  it("records nothing when an editor step is re-entered and changed nothing", () => {
    const store = useDecisionLogStore.getState();
    store.append({ stepId: "carve", payload: carve(4, ["K_Q"]), provenance: HAND_SET });
    expect(store.append({ stepId: "carve", payload: carve(4, ["K_Q"]), provenance: HAND_SET }))
      .toBeNull();
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(1);
  });

  it("does record when only the provenance differs for the same value", () => {
    // Same value, different claim about whose value it is — a real change to
    // what the trail asserts, so it must not be swallowed as a no-op.
    const store = useDecisionLogStore.getState();
    store.append({ stepId: "identity", payload: answer("q", "Latn"), provenance: HAND_SET });
    const second = store.append({
      stepId: "identity",
      payload: answer("q", "Latn"),
      provenance: { agency: "tool-proposed", source: "langtags" },
    });
    expect(second).not.toBeNull();
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(2);
  });

  it("treats two questions in the same step as separate slots", () => {
    const store = useDecisionLogStore.getState();
    store.append({ stepId: "identity", payload: answer("q_a", "x"), provenance: HAND_SET });
    store.append({ stepId: "identity", payload: answer("q_b", "x"), provenance: HAND_SET });
    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(2);
    expect(entries[1]!.supersedes).toBeNull();
  });
});

describe("supersession forms chains, never trees", () => {
  it("links each new entry to the tip of the chain, not to the original", () => {
    const store = useDecisionLogStore.getState();
    const a = store.append({ stepId: "s", payload: answer("q", "1"), provenance: HAND_SET })!;
    const b = store.append({ stepId: "s", payload: answer("q", "2"), provenance: HAND_SET })!;
    const c = store.append({ stepId: "s", payload: answer("q", "3"), provenance: HAND_SET })!;

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries.find((e) => e.entryId === b)!.supersedes).toBe(a);
    expect(entries.find((e) => e.entryId === c)!.supersedes).toBe(b);
    // Exactly one entry per chain is unsuperseded — the definition of a chain.
    const supersededIds = new Set(entries.map((e) => e.supersedes).filter((x) => x !== null));
    expect(entries.filter((e) => !supersededIds.has(e.entryId))).toHaveLength(1);
  });

  it("re-links to the tip when supersede() names an already-replaced entry", () => {
    const store = useDecisionLogStore.getState();
    const a = store.append({ stepId: "s", payload: answer("q", "1"), provenance: HAND_SET })!;
    const b = store.append({ stepId: "s", payload: answer("q", "2"), provenance: HAND_SET })!;
    const c = store.supersede(a, { stepId: "s", payload: answer("q", "3"), provenance: HAND_SET });
    expect(useDecisionLogStore.getState().record.entries.find((e) => e.entryId === c)!.supersedes)
      .toBe(b);
  });

  it("appends without a link when supersede() names an unknown entry", () => {
    const store = useDecisionLogStore.getState();
    const id = store.supersede("nope", { stepId: "s", payload: answer("q", "1"), provenance: HAND_SET });
    expect(useDecisionLogStore.getState().record.entries.find((e) => e.entryId === id)!.supersedes)
      .toBeNull();
  });
});

describe("no in-place mutation of a recorded decision", () => {
  it("leaves every prior entry's decision fields byte-identical after later appends", () => {
    const store = useDecisionLogStore.getState();
    store.append({ stepId: "s", payload: answer("q", "1"), provenance: HAND_SET });
    store.append({ stepId: "t", payload: carve(2), provenance: HAND_SET });
    const before = JSON.stringify(
      useDecisionLogStore.getState().record.entries.map(decisionFieldsOf),
    );

    store.append({ stepId: "s", payload: answer("q", "2"), provenance: HAND_SET });
    store.append({ stepId: "u", payload: answer("r", "z"), provenance: HAND_SET });

    const after = JSON.stringify(
      useDecisionLogStore.getState().record.entries.slice(0, 2).map(decisionFieldsOf),
    );
    expect(after).toBe(before);
  });

  it("attaches impact once and refuses to overwrite it", () => {
    const store = useDecisionLogStore.getState();
    const id = store.append({ stepId: "carve", payload: carve(1), provenance: HAND_SET })!;
    store.attachImpact(id, { state: "none" });
    store.attachImpact(id, {
      state: "captured",
      path: "source/foo.kmn",
      hunks: [],
      magnitude: { added: 1, removed: 0 },
    });
    expect(useDecisionLogStore.getState().record.entries[0]!.impact).toEqual({ state: "none" });
  });

  it("ignores an attachImpact for an unknown entry", () => {
    useDecisionLogStore.getState().attachImpact("ghost", { state: "none" });
    expect(useDecisionLogStore.getState().record.entries).toEqual([]);
  });
});

describe("keyboard identity carry-forward (FR-004)", () => {
  it("stamps keyboardId while leaving every pre-identity entry verbatim", () => {
    const store = useDecisionLogStore.getState();
    store.append({ stepId: "__pre_identity__", payload: answer("q", "x"), provenance: HAND_SET });
    store.append({ stepId: "choose_base", payload: answer("b", "basic_kbdus"), provenance: HAND_SET });
    const before = JSON.stringify(useDecisionLogStore.getState().record.entries);

    store.setKeyboardId("hausa_std");
    const state = useDecisionLogStore.getState();
    expect(state.record.keyboardId).toBe("hausa_std");
    expect(JSON.stringify(state.record.entries)).toBe(before);
  });
});

describe("hydrate", () => {
  it("restores a record and never reissues an id it contains", () => {
    const restored: DecisionEntry = {
      entryId: "d7",
      stepId: "identity",
      payload: answer("q", "x"),
      provenance: HAND_SET,
      recordedAt: 1,
      supersedes: null,
    };
    const store = useDecisionLogStore.getState();
    store.hydrate({
      format: "keyboard-studio.decision-record",
      version: 1,
      keyboardId: "hausa_std",
      entries: [restored],
      truncated: null,
    }, 2);

    expect(useDecisionLogStore.getState().droppedCount).toBe(2);
    const next = store.append({ stepId: "carve", payload: carve(1), provenance: HAND_SET });
    expect(next).toBe("d8");
  });

  it("re-tags a restored pre-v2 record as v2, so a later reload cannot re-migrate it", () => {
    // The chain this guards: a restored v1 draft that stays TAGGED v1 in the
    // store gets snapshotted by draftPersistence under that tag, so the next
    // `parseDecisionRecord` re-runs the v1 migration — which omits all four
    // editor counts unconditionally — over the entries appended in between.
    // Those counts were genuinely measured by this build, and erasing them is
    // exactly the fabricated-absence FR-005a forbids. Asserting on the record's
    // version is asserting that the loop cannot start.
    const store = useDecisionLogStore.getState();
    store.hydrate({
      format: "keyboard-studio.decision-record",
      version: 1,
      keyboardId: "hausa_std",
      entries: [],
      truncated: null,
    });
    expect(useDecisionLogStore.getState().record.version).toBe(DECISION_RECORD_VERSION);

    // A measured entry appended after the restore, snapshotted and read back the
    // way draftPersistence does it, keeps its counts.
    store.append({ stepId: "carve", payload: carve(3, ["K_A"]), provenance: HAND_SET });
    const reread = parseDecisionRecord(
      serializeDecisionRecord(snapshotDecisionRecord()),
    ).record;
    const appended = reread.entries.at(-1)!;
    if (appended.payload.kind !== "editor-action") throw new Error("expected editor-action");
    expect(appended.payload.summary.keysRemoved).toBe(3);
  });

  it("keeps a newer build's higher version rather than pinning it down to this one", () => {
    // Contract §5 row 3: a record from a future build is read entry by entry, not
    // re-labelled as this build's format. The v2 floor above must not become a
    // ceiling.
    useDecisionLogStore.getState().hydrate({
      format: "keyboard-studio.decision-record",
      version: 99,
      keyboardId: null,
      entries: [],
      truncated: null,
    });
    expect(useDecisionLogStore.getState().record.version).toBe(99);
  });
});

describe("pure helpers", () => {
  it("slotKeyOf separates questions from editors within a step", () => {
    expect(slotKeyOf("s", answer("q", "1"))).not.toBe(slotKeyOf("s", carve(1)));
    expect(slotKeyOf("s", answer("q", "1"))).toBe(slotKeyOf("s", answer("q", "2")));
  });

  it("slotKeyOf cannot be collided by an id that contains the key's own structure", () => {
    // The delimiter is `U+0000`, which no identifier can contain — so the key is
    // injective by construction rather than by a convention about how stepIds and
    // questionIds happen to be spelled today. This test is the guard on that
    // choice: with a PRINTABLE delimiter (a space, say), the two triples below
    // would compose the same key, and one decision would silently supersede an
    // unrelated one — quietly breaking the append-only supersession invariant
    // this module's header calls the whole point.
    const shifted = slotKeyOf("step q inner", answer("outer", "v"));
    const straight = slotKeyOf("step", answer("inner q outer", "v"));
    expect(shifted).not.toBe(straight);

    // And across the two branches: under a space delimiter these compose the
    // identical key ("s q e gallery_edit"), so a survey answer and an editor
    // action would share one slot and supersede each other.
    expect(slotKeyOf("s", answer("e gallery_edit", "v"))).not.toBe(slotKeyOf("s q", carve(1)));
  });

  it("payloadsEqual compares char-list values element-wise", () => {
    const a: DecisionPayload = { kind: "survey-answer", questionId: "q", answerType: "char-list", value: ["a", "b"] };
    const b: DecisionPayload = { kind: "survey-answer", questionId: "q", answerType: "char-list", value: ["a", "b"] };
    const c: DecisionPayload = { kind: "survey-answer", questionId: "q", answerType: "char-list", value: ["b", "a"] };
    expect(payloadsEqual(a, b)).toBe(true);
    expect(payloadsEqual(a, c)).toBe(false);
  });

  it("liveEntryForSlot returns undefined for a slot with no entries", () => {
    expect(liveEntryForSlot([], "nothing")).toBeUndefined();
  });

  it("chainTip terminates on a cyclic restored record instead of hanging", () => {
    const cyclic: DecisionEntry[] = [
      { entryId: "a", stepId: "s", payload: answer("q", "1"), provenance: HAND_SET, recordedAt: 1, supersedes: "b" },
      { entryId: "b", stepId: "s", payload: answer("q", "2"), provenance: HAND_SET, recordedAt: 2, supersedes: "a" },
    ];
    expect(typeof chainTip(cyclic, "a")).toBe("string");
  });
});

/** The immutable half of an entry — everything except the attachable impact. */
function decisionFieldsOf(entry: DecisionEntry) {
  return {
    entryId: entry.entryId,
    stepId: entry.stepId,
    payload: entry.payload,
    provenance: entry.provenance,
    supersedes: entry.supersedes,
  };
}
