// reviewFlags (spec 117 US8, FR-063/FR-064): the three flag kinds, keep clearing (a), and the two
// revert routes (latest entry undone; an older one reverted by an appended inverse entry).

import { beforeEach, describe, expect, it } from "vitest";
import { applyIRChanges, diffIR, emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { CodeEdit, KeyboardIR, KmnEdit, KmnEditsValue } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { keepFlag, revertFlag } from "./CodeReviewList.tsx";
import { reviewFlags } from "./reviewFlags.ts";

const KMN = [
  "store(&NAME) 'flags'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ 'a' > 'b'",
  "+ 'c' > 'd'",
  "",
].join("\n");

const parse = (text: string): KeyboardIR => parseKmn(text, "flags").ir;

function codeEdit(seq: number, before: KeyboardIR, afterText: string, overrides: CodeEdit["overrides"] = []): CodeEdit {
  return { seq, at: 0, op: "code-apply", changes: diffIR(before, parse(afterText)), overrides };
}

const value = (entries: KmnEdit[]): KmnEditsValue => ({ entries });

describe("reviewFlags", () => {
  const base = parse(KMN);
  const OVERRIDE: CodeEdit["overrides"] = [{ change: 0, owner: "rules-step" }];

  it("(a) flags a CodeEdit with overrides and no ReviewKept, once per entry", () => {
    const e = codeEdit(1, base, KMN.replace("'d'", "'e'"), OVERRIDE);
    const flags = reviewFlags(value([e]), [], null);
    expect(flags).toEqual([{ kind: "overrode", seq: 1, owners: ["rules-step"], changes: e.changes.length }]);
  });

  it("(a) does not flag an entry without overrides", () => {
    const e = codeEdit(1, base, KMN.replace("'d'", "'e'"));
    expect(reviewFlags(value([e]), [], null)).toEqual([]);
  });

  it("(a) a ReviewKept for the entry clears its flag", () => {
    const e = codeEdit(1, base, KMN.replace("'d'", "'e'"), OVERRIDE);
    const kept: KmnEdit = { seq: 2, at: 0, op: "review-kept", target: 1 };
    expect(reviewFlags(value([e, kept]), [], null)).toEqual([]);
  });

  it("(b) flags every replay miss that has not been kept", () => {
    const e = codeEdit(1, base, KMN.replace("'d'", "'e'"));
    const flags = reviewFlags(
      value([e]),
      [
        { seq: 1, reason: "change 0 (replace): anchor not found" },
        { seq: 1, reason: "change 1 (insert): anchor not found" },
      ],
      null,
    );
    expect(flags.map((f) => f.kind)).toEqual(["missed", "missed"]);
    const kept: KmnEdit = { seq: 2, at: 0, op: "review-kept", target: 1 };
    expect(reviewFlags(value([e, kept]), [{ seq: 1, reason: "x" }], null)).toEqual([]);
  });

  it("(c) flags a rule a code entry inserted that an earlier rule shadows", () => {
    const e = codeEdit(1, base, KMN.replace("+ 'a' > 'b'\n", "+ 'a' > 'b'\n+ 'a' > 'z'\n"));
    const ir = applyIRChanges(base, e.changes).ir;
    const flags = reviewFlags(value([e]), [], ir);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "shadowed", seq: 1 });
  });

  it("(c) flags a code-inserted rule that an Assign-tab rule shadows in the projected keyboard only", () => {
    const withCode = KMN.replace("+ 'c' > 'd'\n", "+ 'c' > 'd'\n+ 'e' > 'f'\n");
    const e = codeEdit(1, base, withCode);
    const ir = applyIRChanges(base, e.changes).ir;
    // The projection holds a rule the Assign tab put in front of the code rule; the working IR does not.
    const projected = parse(withCode.replace("+ 'a' > 'b'\n", "+ 'e' > 'q'\n+ 'a' > 'b'\n"));
    expect(reviewFlags(value([e]), [], ir)).toEqual([]);
    const flags = reviewFlags(value([e]), [], ir, projected);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "shadowed", seq: 1, projected: true });
    const kept: KmnEdit = { seq: 2, at: 0, op: "review-kept", target: 1 };
    expect(reviewFlags(value([e, kept]), [], ir, projected)).toEqual([]);
  });

  it("(c) does not flag the same shadowed rule twice when the working IR and the projection both show it", () => {
    const e = codeEdit(1, base, KMN.replace("+ 'a' > 'b'\n", "+ 'a' > 'b'\n+ 'a' > 'z'\n"));
    const ir = applyIRChanges(base, e.changes).ir;
    expect(reviewFlags(value([e]), [], ir, ir)).toHaveLength(1);
  });

  it("(c) does not flag a shadowed rule that no code entry inserted", () => {
    const shadowed = parse(KMN.replace("+ 'a' > 'b'\n", "+ 'a' > 'b'\n+ 'a' > 'z'\n"));
    expect(reviewFlags(value([]), [], shadowed)).toEqual([]);
  });
});

describe("keep and revert", () => {
  const recorded = (): KmnEdit[] =>
    (useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined)?.entries ?? [];
  const current = (): KmnEditsValue => ({ entries: recorded() });

  function apply(afterText: string, overrides: CodeEdit["overrides"] = []): void {
    const ir = useWorkingCopyStore.getState().ir!;
    const result = useWorkingCopyStore.getState().commitKmnEdit({
      op: "code-apply",
      changes: diffIR(ir, parse(afterText)),
      overrides,
    });
    expect(result.ok).toBe(true);
  }

  beforeEach(() => {
    const ir = parse(KMN);
    useWorkingCopyStore.setState({ ir, startIr: ir, undoStack: [], desktopLocked: false });
    useDecisionStore.getState().reset();
  });

  it("keep records a ReviewKept that clears the flag", () => {
    apply(KMN.replace("'d'", "'e'"), [{ change: 0, owner: "layout-tab" }]);
    expect(reviewFlags(current(), [], useWorkingCopyStore.getState().ir)).toHaveLength(1);
    keepFlag(1);
    expect(recorded().map((e) => e.op)).toEqual(["code-apply", "review-kept"]);
    expect(reviewFlags(current(), [], useWorkingCopyStore.getState().ir)).toEqual([]);
  });

  it("revert of the latest entry undoes it (no inverse entry is appended)", () => {
    apply(KMN.replace("'d'", "'e'"));
    expect(revertFlag(1, current())).toBe(true);
    expect(recorded()).toEqual([]);
    expect(emitKmn(useWorkingCopyStore.getState().ir!)).toBe(emitKmn(parse(KMN)));
  });

  it("revert of an older entry appends its inverse as a new entry and clears its flag", () => {
    apply(KMN.replace("'d'", "'e'"), [{ change: 0, owner: "layout-tab" }]);
    const afterFirst = emitKmn(useWorkingCopyStore.getState().ir!);
    apply(afterFirst.replace("U+0061 > U+0062", "U+0061 > U+0066"));
    expect(revertFlag(1, current())).toBe(true);
    expect(recorded().map((e) => e.op)).toEqual(["code-apply", "code-apply", "code-apply", "review-kept"]);
    const text = emitKmn(useWorkingCopyStore.getState().ir!);
    expect(text).toContain("U+0064");
    expect(text).not.toContain("U+0065");
    expect(text).toContain("U+0066");
    expect(reviewFlags(current(), [], useWorkingCopyStore.getState().ir)).toEqual([]);
  });
});
