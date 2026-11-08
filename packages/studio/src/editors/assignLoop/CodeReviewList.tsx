// CodeReviewList -- the Code tab's review flags (spec 113 US8, FR-063, FR-064).
//
// Each flag says what changed, why it is flagged, and offers "view in code", keep, and revert.
// Real buttons with accessible names; the list is a labelled region. Flags block neither
// completion nor download. `useCodeReviewFlags` derives the flags from the recorded `kmn-edits`
// entries, the working IR, and the replay misses the projection reports.

import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { invertChanges } from "@keyboard-studio/engine";
import type { CodeEdit, KmnEditsValue, OwnerRef } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "../../lib/serializeWorkingCopy.ts";
import { nodeIdForFlag, reviewFlags, type ReplayMissLike, type ReviewFlag } from "./reviewFlags.ts";

const MISS_WARNING = /layout edit (\d+) skipped: (.*)$/;

/**
 * Replay misses for the recorded entries, read from the output projection's warnings (it replays
 * onto the IR it assembles, which is the one that ships). Runs once per change to the entries or
 * the IR, never on a timer, and only when a Code-tab entry exists.
 */
function useReplayMisses(value: KmnEditsValue | undefined): readonly ReplayMissLike[] {
  const ir = useWorkingCopyStore((s) => s.ir);
  const [misses, setMisses] = useState<readonly ReplayMissLike[]>([]);
  const hasCode = value?.entries.some((e) => e.op === "code-apply") === true;
  useEffect(() => {
    if (!hasCode) {
      setMisses([]);
      return;
    }
    let live = true;
    void projectWorkingCopyForOutput()
      .then((projected) => {
        if (!live || projected === null) return;
        const found: ReplayMissLike[] = [];
        for (const w of projected.warnings) {
          const m = MISS_WARNING.exec(w);
          if (m?.[1] !== undefined && m[2] !== undefined) found.push({ seq: Number(m[1]), reason: m[2] });
        }
        setMisses(found);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hasCode, value, ir]);
  return misses;
}

export function useCodeReviewFlags(): { flags: ReviewFlag[]; value: KmnEditsValue | undefined } {
  const value = useDecisionStore((s) => s.decisions["kmn-edits"]?.value) as KmnEditsValue | undefined;
  const ir = useWorkingCopyStore((s) => s.ir);
  const misses = useReplayMisses(value);
  return { flags: reviewFlags(value, misses, ir), value };
}

/** Keep: record that the author reviewed the entry (clears its flags). */
export function keepFlag(seq: number): void {
  useWorkingCopyStore.getState().commitKmnEdit({ op: "review-kept", target: seq });
}

/**
 * Revert the entry behind a flag. The latest entry is undone; an older one is reverted by
 * appending its inverse as a new entry, so the list stays append-only, and the original entry is
 * marked reviewed so its flags clear.
 */
export function revertFlag(seq: number, value: KmnEditsValue | undefined): boolean {
  const store = useWorkingCopyStore.getState();
  const entry = value?.entries.find((e): e is CodeEdit => e.op === "code-apply" && e.seq === seq);
  if (entry === undefined) return false;
  const top = store.undoStack[store.undoStack.length - 1];
  if (top?.k === "c" && top.seq === seq) return store.undoKmnEdit();
  const result = store.commitKmnEdit({ op: "code-apply", changes: invertChanges(entry.changes), overrides: [] });
  if (!result.ok) return false;
  store.commitKmnEdit({ op: "review-kept", target: seq });
  return true;
}

export interface CodeReviewListProps {
  readonly flags: readonly ReviewFlag[];
  readonly value: KmnEditsValue | undefined;
  readonly onViewInCode: (nodeId: string | undefined) => void;
}

export function CodeReviewList({ flags, value, onViewInCode }: CodeReviewListProps) {
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  if (flags.length === 0) return null;

  const ownerWords = (owner: OwnerRef["owner"]): string => {
    switch (owner) {
      case "deadkeys":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.deadkeys", message: "the deadkey editor" });
      case "rules-step":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.rulesStep", message: "the rules step" });
      case "layout-tab":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.layoutTab", message: "the Layout tab" });
      case "code-tab":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.codeTab", message: "an earlier Code tab edit" });
      case "identity":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.identity", message: "the keyboard identity" });
      case "another-step":
        return t({ id: "editor.assignLoop.mechanisms.code.owner.anotherStep", message: "another step" });
    }
  };

  const what = (f: ReviewFlag): string => {
    switch (f.kind) {
      case "overrode":
        return t({
          id: "editor.assignLoop.mechanisms.code.review.overrode",
          message: `Code edit ${{ seq: f.seq }} changed work made by ${{ owners: f.owners.map(ownerWords).join(", ") }}.`,
        });
      case "missed":
        return t({
          id: "editor.assignLoop.mechanisms.code.review.missed",
          message: `Code edit ${{ seq: f.seq }} could not be applied to the keyboard as built: ${{ reason: f.reason }}`,
        });
      case "shadowed":
        return t({
          id: "editor.assignLoop.mechanisms.code.review.shadowed",
          message: "A rule you added in code never fires: an earlier rule with the same input comes first.",
        });
    }
  };

  return (
    <section
      data-testid="kmn-code-review"
      aria-label={t({ id: "editor.assignLoop.mechanisms.code.review.label", message: "Code edits to review" })}
    >
      <ul>
        {flags.map((f, i) => {
          const key = `${f.kind}-${f.seq ?? "x"}-${i}`;
          const keepSeq = f.seq;
          return (
            <li key={key} data-testid="kmn-code-review-flag">
              <span>{what(f)}</span>{" "}
              <button
                type="button"
                data-testid="kmn-code-review-view"
                onClick={() => onViewInCode(nodeIdForFlag(f, value, ir))}
              >
                {t({ id: "editor.assignLoop.mechanisms.code.review.view", message: "View in code" })}
              </button>
              {keepSeq !== null && (
                <>
                  <button type="button" data-testid="kmn-code-review-keep" onClick={() => keepFlag(keepSeq)}>
                    {t({ id: "editor.assignLoop.mechanisms.code.review.keep", message: "Keep" })}
                  </button>
                  <button type="button" data-testid="kmn-code-review-revert" onClick={() => revertFlag(keepSeq, value)}>
                    {t({ id: "editor.assignLoop.mechanisms.code.review.revert", message: "Revert" })}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
