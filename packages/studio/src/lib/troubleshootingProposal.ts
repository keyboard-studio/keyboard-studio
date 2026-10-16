// troubleshootingProposal — facet-derived suggestion lines for the Phase F
// question `pf_troubleshooting` (issue #1800, km-lead ruling
// queue-1800-ruling.md: Option B, facet templates only).
//
// The proposal is studio-authored template text, parameterised by facts
// about the keyboard being built — the same class as the generated
// mechanism paragraphs (spec 102 FR-015). No base-keyboard prose is read
// here: spec 080 FR-007 / spec 102 FR-032 bar base help prose from a copy's
// documentation, and on the adapt track the base's troubleshooting
// section already ships inside the inherited prose, so extracting it
// would duplicate the section. AC1 (base-help extraction) is a follow-on
// issue gated on a recorded FR-007 carve-out decision.
//
// The lines are offered through the spec-092 seed pipeline: the wiring
// (decisions/liveExtraction.ts) computes this value into
// `ExtractContext.phaseF.troubleshootingProposal`, the question module's
// `extract` reads it, and the author keeps, edits, or deletes each line —
// nothing is an answer until the author commits it (spec 079 FR-008), and
// `helpDocsFromDecisions` refuses a still-`extracted` troubleshooting
// record outright (the AC3 guard), so a seed the author never saw cannot
// reach the help page.
//
// Gates are deliberately strict (§3c: a confidently wrong default is as
// much a failure as a blank one):
//
// - Deadkey line: a rule in a `using keys` group whose output is SOLELY
//   deadkey elements (the keystroke visibly types nothing) AND another
//   rule consuming one of those deadkeys. A context-only deadkey test is
//   wrong: keyboards like korean_rr use dk() purely as internal
//   composition state after visible output, and their users never press
//   a key that "types nothing".
// - Mark-ordering line: only when the session's markInputOrder is
//   "postfix" AND a rule output emits a combining mark (Mn/Mc). Marks
//   existing proves nothing about typing order — prefix keyboards type
//   the mark first, and offering them the postfix line would assert the
//   opposite of their users' experience. Prefix gets no line (a prefix
//   mark typed via a deadkey is the deadkey line's case).
//
// RALT-conflict and NFC/NFD templates are excluded by the ruling
// (platform-false as generics; NFC/NFD needs a behavioural tolerance
// report, not a facet). The template set is fixed, so AC4 (no generic
// Keyman boilerplate — fonts, installation) holds by construction; a
// test pins that.

import type { KeyboardIR, MarkInputOrder } from "@keyboard-studio/contracts";

/** Symptom - fix, one line, in the register of the question's help text. */
export const DEADKEY_TROUBLESHOOTING_LINE =
  "Nothing appears when I press a key - press the next key, and the character appears; some characters on this keyboard are typed in two steps.";

/** Postfix mark-ordering line — offered only under the postfix gate. */
export const MARK_ORDER_TROUBLESHOOTING_LINE =
  "Marks appear in the wrong place - type the letter first, then the mark.";

/** The working-copy facts the proposal derives from. */
export interface TroubleshootingProposalContext {
  /** The working copy's current IR (falls back to the start IR upstream). */
  ir: KeyboardIR | null;
  /** The session's mark-input-order axis, when derived. */
  markInputOrder?: MarkInputOrder;
}

/**
 * True when some keystroke's whole output is deadkey state (the key
 * visibly types nothing) and a rule consumes one of those deadkeys —
 * the user-facing deadkey mechanism, as opposed to internal dk() state
 * machinery that rides along with visible output.
 */
export function hasUserFacingDeadkey(ir: KeyboardIR): boolean {
  const triggerIds = new Set<number>();
  for (const group of ir.groups) {
    if (!group.usingKeys) continue;
    for (const rule of group.rules) {
      if (
        rule.output.length > 0 &&
        rule.output.every((el) => el.kind === "deadkey")
      ) {
        for (const el of rule.output) {
          if (el.kind === "deadkey") triggerIds.add(el.id);
        }
      }
    }
  }
  if (triggerIds.size === 0) return false;
  return ir.groups.some((group) =>
    group.rules.some((rule) =>
      rule.context.some((el) => el.kind === "deadkey" && triggerIds.has(el.id)),
    ),
  );
}

/** True when any rule output emits a combining mark (Mn or Mc) directly. */
export function emitsCombiningMark(ir: KeyboardIR): boolean {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if (el.kind !== "char") continue;
        for (const ch of el.value) {
          if (/\p{Mn}|\p{Mc}/u.test(ch)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * The troubleshooting proposal for `pf_troubleshooting`: the gated
 * template lines joined one per line (the answer's documented format),
 * or undefined when neither gate fires — the question then opens blank,
 * exactly as before this feature.
 */
export function proposeTroubleshooting(
  ctx: TroubleshootingProposalContext,
): string | undefined {
  if (ctx.ir === null) return undefined;
  const lines: string[] = [];
  if (hasUserFacingDeadkey(ctx.ir)) lines.push(DEADKEY_TROUBLESHOOTING_LINE);
  if (ctx.markInputOrder === "postfix" && emitsCombiningMark(ctx.ir)) {
    lines.push(MARK_ORDER_TROUBLESHOOTING_LINE);
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}
