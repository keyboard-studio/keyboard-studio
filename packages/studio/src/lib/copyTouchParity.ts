/**
 * Copy-flow tap parity gate — spec 104 T014 (FR-014, SC-002).
 *
 * FR-014: a Copy MUST produce a keyboard whose effective touch production
 * matches the source for every key the criteria did not intentionally
 * change. The check is behavioural, not textual: both virtual file systems
 * are compiled with the engine compiler and their tap behaviour is diffed
 * by the engine's parity differ (`diffTapBehaviour` — table + letter /
 * space / digit seeded contexts + deadkey pairs, SC-002's probe classes).
 *
 * Shape note (T014): the tap harness (`TouchTapSession`) is exported from
 * `@keyboard-studio/engine/simulator` as of this wave, so the differ lives
 * at engine level where the harness lives, and this module is the studio
 * copy flow's wire to its result: compile both sides, return the report.
 * An empty `diffs` is the gate passing; callers surface a non-empty report
 * as a parity failure naming the keys whose typing changed.
 */

import type { VirtualFS } from "@keyboard-studio/contracts";
import { compile } from "@keyboard-studio/engine";
import { diffTapBehaviour, type TapParityReport } from "@keyboard-studio/engine/simulator";

export type { TapParityReport, TapBehaviourDiff, TapProbeKind } from "@keyboard-studio/engine/simulator";

export interface CopyTouchParityInput {
  /** The source keyboard's files (the keyboard being copied). */
  readonly sourceVfs: VirtualFS;
  /** The copy's files, as the copy flow produced them. */
  readonly copyVfs: VirtualFS;
  /** The keyboard id both VFSes compile under (their shared source name). */
  readonly keyboardId: string;
}

export type CopyTouchParityResult =
  | { readonly ok: true; readonly report: TapParityReport }
  | {
      readonly ok: false;
      readonly stage: "compile-source" | "compile-copy";
      /** Compile diagnostics text for the failing side. */
      readonly detail: string;
    };

/**
 * Run the parity gate: compile source and copy, diff their tap behaviour.
 * A compile failure on either side is a gate failure at that stage — a
 * copy that does not compile cannot be at parity.
 */
export async function checkCopyTouchParity(
  input: CopyTouchParityInput,
): Promise<CopyTouchParityResult> {
  const source = await compile(input.sourceVfs, input.keyboardId);
  if (!source.success) {
    return {
      ok: false,
      stage: "compile-source",
      detail: JSON.stringify(source.diagnostics),
    };
  }
  const copy = await compile(input.copyVfs, input.keyboardId);
  if (!copy.success) {
    return { ok: false, stage: "compile-copy", detail: JSON.stringify(copy.diagnostics) };
  }
  return { ok: true, report: diffTapBehaviour(source, copy) };
}
