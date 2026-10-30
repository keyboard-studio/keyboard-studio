// The sequence builder's lifted Apply (spec 107 FR-040).

import { describe, expect, it } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { hasSequenceForChar, partitionSequenceAssignment, sequenceApplyFor } from "./sequenceApply.ts";

const none: MechanismAssignment[] = [];

describe("sequenceApplyFor", () => {
  it("records a new sequence in the character's own bucket and hands back what the companion needs", () => {
    const out = sequenceApplyFor({ char: "ə", content: "zzq259", indicator: "j", sessionAssignments: none });
    expect(out.kind).toBe("record");
    if (out.kind !== "record") return;
    expect(out.next).toEqual([out.applied.assignment]);
    expect(out.applied.content).toBe("zzq259");
    expect(out.applied.indicator).toBe("j");
    expect(out.applied.assignment).toEqual({
      scope: "individual",
      target: "ə",
      modality: "physical",
      mechanisms: [
        {
          patternId: "multi_char_sequence",
          strategyId: "S-03",
          slotValues: { firstLetterOut: "zzq259", secondLetter: "j", collapsedChar: "ə" },
        },
      ],
      source: "user",
    });
  });

  it("keeps other characters' assignments and adds a second sequence to the same bucket", () => {
    const first = sequenceApplyFor({ char: "ə", content: "zzq259", indicator: "j", sessionAssignments: none });
    if (first.kind !== "record") throw new Error("setup");
    const other: MechanismAssignment = {
      scope: "individual",
      target: "ŋ",
      modality: "physical",
      mechanisms: [],
      source: "user",
    };
    const second = sequenceApplyFor({
      char: "ə",
      content: "ee",
      indicator: "j",
      sessionAssignments: [other, ...first.next],
    });
    if (second.kind !== "record") throw new Error("expected a record");
    expect(second.next[0]).toBe(other);
    expect(partitionSequenceAssignment(second.next, "ə").mechs).toHaveLength(2);
    expect(hasSequenceForChar(second.next, "ə")).toBe(true);
  });

  it("is a no-op for an identical (content, indicator) pair", () => {
    const first = sequenceApplyFor({ char: "ə", content: "zzq259", indicator: "j", sessionAssignments: none });
    if (first.kind !== "record") throw new Error("setup");
    expect(
      sequenceApplyFor({ char: "ə", content: "zzq259", indicator: "j", sessionAssignments: first.next }).kind,
    ).toBe("noop");
  });

  it("does not apply an empty box or an indicator that is not a physical key", () => {
    expect(sequenceApplyFor({ char: "ə", content: "", indicator: "j", sessionAssignments: none }).kind).toBe(
      "unresolved",
    );
    expect(sequenceApplyFor({ char: "ə", content: "a", indicator: "", sessionAssignments: none }).kind).toBe(
      "unresolved",
    );
    expect(sequenceApplyFor({ char: "ə", content: "a", indicator: "ə", sessionAssignments: none }).kind).toBe(
      "unresolved",
    );
  });
});
