/**
 * replayKmnEdits — rebuild the Layout-tab edits from the `kmn-edits` log
 * (spec 117, contracts/layout-ops.md "Replay is not a plain reduce").
 *
 * The list is normalised first: a `clear-key` drops the earlier `set-key`
 * entries for its `(vkey, layer)` (and is itself spent: it has no IR effect of
 * its own). The survivors apply in order through `applyLayoutOp`, so later
 * entries on the same slot win and replaying the same log on the same IR is
 * idempotent.
 *
 * A Code-tab `code-apply` entry replays after all the other entries, whatever order they were
 * recorded in (spec 117 R15), except that a change a later Layout-tab entry supersedes is skipped
 * (supersede.ts: the most recent edit on a key wins). It applies its content-anchored changes through
 * `applyIRChanges`; each change whose anchor is gone is reported as a miss with
 * the entry's `seq` (never thrown, never dropped silently). `review-kept` has no
 * IR effect.
 */

import type { KeyboardIR, KmnEdit } from "@keyboard-studio/contracts";
import { applyIRChanges } from "../kmn-diff/applyIRChanges.js";
import { applyLayoutOp } from "./applyLayoutOp.js";
import { sameLayer } from "./ruleMatch.js";
import { supersededChangeIndexes } from "./supersede.js";
import type { ReplayMiss } from "./types.js";

export interface ReplayResult {
  ir: KeyboardIR;
  misses: ReplayMiss[];
}

/** The entries replay actually applies: clear-keys resolved away, order kept. */
export function normaliseKmnEdits(entries: readonly KmnEdit[]): KmnEdit[] {
  const out: KmnEdit[] = [];
  for (const entry of entries) {
    if (entry.op === "clear-key") {
      for (let i = out.length - 1; i >= 0; i--) {
        const e = out[i];
        if (e !== undefined && e.op === "set-key" && e.vkey === entry.vkey && sameLayer(e.layer, entry.layer)) {
          out.splice(i, 1);
        }
      }
      continue;
    }
    out.push(entry);
  }
  return out;
}

/** Which entries a replay applies: the Layout-tab ones, the Code-tab ones, or both (layout first). */
export type ReplayScope = "all" | "layout" | "code";

/**
 * The supersede rule (supersede.ts) is computed from the WHOLE log whatever the scope, so the
 * studio's projection can replay the Layout-tab entries at one step and the Code-tab entries at a
 * later one and still skip a code change a later Layout-tab entry supersedes.
 */
export function replayKmnEdits(ir: KeyboardIR, entries: readonly KmnEdit[], scope: ReplayScope = "all"): ReplayResult {
  let current = ir;
  const misses: ReplayMiss[] = [];
  // Code-tab entries replay after every other entry, each group in recorded order: the studio's
  // projection applies the Layout-tab edits before it generates rules (marks, tolerance, caps)
  // and the Code-tab edits after, so a whole-log replay here is the same keyboard.
  const normalised = normaliseKmnEdits(entries);
  const layout = scope === "code" ? [] : normalised.filter((e) => e.op !== "code-apply");
  const code = scope === "layout" ? [] : normalised.filter((e) => e.op === "code-apply");
  for (const entry of [...layout, ...code]) {
    if (entry.op === "review-kept") continue;
    if (entry.op === "code-apply") {
      const skip = supersededChangeIndexes(entry, entries);
      const kept = entry.changes.map((_, i) => i).filter((i) => !skip.has(i));
      if (kept.length === 0) continue;
      const result = applyIRChanges(current, kept.map((i) => entry.changes[i]!));
      current = result.ir;
      for (const k of result.misses) {
        const index = kept[k]!;
        misses.push({ seq: entry.seq, reason: `change ${index} (${entry.changes[index]?.change ?? "unknown"}): anchor not found` });
      }
      continue;
    }
    current = applyLayoutOp(current, entry).ir;
  }
  return { ir: current, misses };
}
