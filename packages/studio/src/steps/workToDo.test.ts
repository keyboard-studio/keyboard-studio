// workToDo.test.ts — spec 079 T049 (R-10, SC-008).

import { describe, expect, it } from "vitest";
import { selectWorkToDo, type WorkToDoInput } from "./workToDo.ts";
import type { ReproposalReason } from "./answerTypes.ts";

const REASON: ReproposalReason = { code: "evidence-added", subject: "b", sourceStepId: "characters" };

function emptyInput(overrides: Partial<WorkToDoInput> = {}): WorkToDoInput {
  return {
    flagged: {},
    unaccounted: { mechanisms: 0, touch: 0 },
    notAsked: {},
    ...overrides,
  };
}

describe("selectWorkToDo", () => {
  it("reports a reproposed item per flagged answer", () => {
    const out = selectWorkToDo(
      emptyInput({
        flagged: {
          marks: [{ answerId: "marks_attachment.́|b", screenId: "marks_attachment", reason: REASON }],
        },
      }),
    );
    expect(out.marks).toEqual([
      {
        kind: "reproposed",
        stepId: "marks",
        screenId: "marks_attachment",
        answerId: "marks_attachment.́|b",
        reason: REASON,
      },
    ]);
  });

  it("reports unassigned items for mechanisms and touch (US3 scenario 5)", () => {
    const out = selectWorkToDo(emptyInput({ unaccounted: { mechanisms: 2, touch: 1 } }));
    expect(out.mechanisms).toEqual([{ kind: "unassigned", stepId: "mechanisms", count: 2 }]);
    expect(out.touch).toEqual([{ kind: "unassigned", stepId: "touch", count: 1 }]);
  });

  it("omits mechanisms/touch entries when nothing is unaccounted", () => {
    const out = selectWorkToDo(emptyInput());
    expect(out.mechanisms).toBeUndefined();
    expect(out.touch).toBeUndefined();
  });

  it("reports now-applicable for a not-asked step whose gate now applies (FR-067)", () => {
    const out = selectWorkToDo(
      emptyInput({ notAsked: { convenience: { reason: REASON, gateApplies: true } } }),
    );
    expect(out.convenience).toEqual([{ kind: "now-applicable", stepId: "convenience", reason: REASON }]);
  });

  it("does not report a not-asked step whose gate still does not apply", () => {
    const out = selectWorkToDo(
      emptyInput({ notAsked: { convenience: { reason: REASON, gateApplies: false } } }),
    );
    expect(out.convenience).toBeUndefined();
  });

  it("items vanish when resolved (empty flagged array yields no entry)", () => {
    const out = selectWorkToDo(emptyInput({ flagged: { marks: [] } }));
    expect(out.marks).toBeUndefined();
  });

  it("unaffected steps have none", () => {
    const out = selectWorkToDo(
      emptyInput({ flagged: { marks: [{ answerId: "a", screenId: "s", reason: REASON }] } }),
    );
    expect(out.characters).toBeUndefined();
    expect(out.punctuation).toBeUndefined();
  });

  it("combines flagged, unaccounted and not-asked kinds on independent steps", () => {
    const out = selectWorkToDo({
      flagged: { marks: [{ answerId: "a", screenId: "s", reason: REASON }] },
      unaccounted: { mechanisms: 3, touch: 0 },
      notAsked: { convenience: { reason: REASON, gateApplies: true } },
    });
    expect(Object.keys(out).sort()).toEqual(["convenience", "marks", "mechanisms"]);
  });
});
