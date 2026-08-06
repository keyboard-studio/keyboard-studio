// Structural context for a crash report, read at the CALL SITE
// (spec 060, FR-012, FR-040 – FR-042, FR-046, E-4).
//
// WHY THIS FILE IS NOT IN src/crash/.
//
// It imports the stores. `decisionLogStore.ts` value-imports
// `@keyboard-studio/engine` at its line 37, and `workingCopyStore.ts` reaches
// the engine too. A failed engine chunk is one of the crash classes the
// reporter exists to report, so the reporter must not import any of them —
// enforced by packages/studio/src/crash/engine-reachability.test.ts, which
// would flag this module immediately if it lived one directory over.
//
// The split is the whole design: the CALLER reads the stores and hands the
// result to the crash module as plain data (FR-042). If this module cannot run
// — because the engine is exactly what broke — the caller catches, passes no
// context, and the report still files with kind, message, stack, and build id.
// A missing context section costs debugging convenience; an unimportable
// reporter costs the whole report.

import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import type { CrashContext, DecisionTailEntry } from "../crash/types.ts";

/** How many of the most-recent decision entries travel with a report. */
export const DECISION_TAIL_LENGTH = 10;

/**
 * Reduce a decision entry to structural handles only.
 *
 * `stepId` and the payload's `kind` are step and decision identifiers — fixed
 * vocabulary from the manifest, not author-authored text. The payload itself is
 * deliberately NOT carried: it can hold survey answers and free text, which is
 * precisely the "smuggle identity through a different layer" route FR-047
 * closes.
 */
function tailEntry(entry: {
  stepId: string;
  payload: { kind?: string };
}): DecisionTailEntry {
  return {
    id: entry.stepId,
    ...(typeof entry.payload.kind === "string" ? { choice: entry.payload.kind } : {}),
  };
}

/**
 * Read every FR-040 field that is currently available.
 *
 * Each read is individually guarded. This runs while the app is failing, so any
 * one store may be uninitialised, mid-update, or backed by a module that did
 * not load — and a context collector that throws would turn a reportable crash
 * into an unreported one.
 *
 * Fields are OMITTED, never fabricated (FR-046): no `keyboardId: ""`, no empty
 * `bcp47Tags` array. "Unresolved" and "confirmed none" are different facts and a
 * maintainer will act on them differently.
 */
export function collectCrashContext(): CrashContext {
  const context: CrashContext = {};

  try {
    const wc = useWorkingCopyStore.getState();

    const keyboardId = wc.identity?.keyboardId;
    if (typeof keyboardId === "string" && keyboardId !== "") {
      context.keyboardId = keyboardId;
    }

    const bcp47 = wc.identity?.bcp47;
    if (typeof bcp47 === "string" && bcp47 !== "") {
      context.bcp47Tags = [bcp47];
    }

    // Rule count across the IR's groups — a size signal, not content.
    const ir = wc.ir;
    if (ir !== null && ir !== undefined) {
      const keyCount = ir.groups.reduce((sum, g) => sum + g.rules.length, 0);
      context.keyCount = keyCount;
    }
  } catch {
    // No working copy, or the store's module graph is what failed.
  }

  try {
    // `ActiveStepId` is a closed union of manifest step ids, so there is no
    // empty-string case to exclude here — the type has already done it.
    const activeStepId: string = useSurveySessionStore.getState().activeStepId;
    context.stepId = activeStepId;
  } catch {
    // No survey session yet.
  }

  try {
    const draft = usePhaseBDraftStore.getState();
    const exemplarCount = draft.chars.length;
    if (Number.isFinite(exemplarCount)) context.exemplarCount = exemplarCount;
  } catch {
    // Phase B not reached.
  }

  try {
    const entries = useDecisionLogStore.getState().record.entries;
    if (entries.length > 0) {
      context.decisionTail = entries.slice(-DECISION_TAIL_LENGTH).map(tailEntry);
    }
  } catch {
    // No decision log — a pre-identity crash, or the engine import failed.
  }

  return context;
}

/**
 * Collect context without ever throwing.
 *
 * `collectCrashContext` already guards each read, but this is the crash path:
 * the belt-and-braces wrapper means a future edit that adds an unguarded read
 * degrades to "no context" rather than to "no report".
 */
export function safeCollectCrashContext(): CrashContext | undefined {
  try {
    const context = collectCrashContext();
    return Object.keys(context).length > 0 ? context : undefined;
  } catch {
    return undefined;
  }
}
