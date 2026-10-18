// marksValue — the marks-treatment decision value and its record surface
// (spec 090 T023, design record D-090-11).
//
// The value type lives here, not in the gallery module file, for the
// D-090-8 reason: the module imports the renderer (MarksSeriesStep), the
// renderer and the context-tolerance apply hook import these helpers, and
// neither may import the module file without closing a cycle through the
// registry. The module (survey/questions/gallery/marksTreatment.ts)
// re-exports the types.
//
// Shape (D-090-11): `answers` is the marks-series answer composite,
// recorded at the step's existing decision-record commit points (each
// station's Next and completion — the points where the decision log is
// written today); `completion` is null until the series completes, when
// the renderer reports the placement worklist + output form the module's
// apply runs the mark guards from — the guards never run per answer, so
// a partial series can never guard a partial worklist. An answer record
// after completion carries `completion: null` again, so a stale payload
// can never re-apply. `migrationNeeded` is the retired reducer MARKS
// handler's R10 determination, computed by the renderer at the
// completion report from the pre-guard working IR (the exact inputs the
// reducer read) and mirrored into the session by MarksStepHost — apply
// itself has no session channel. `contextTolerance` is the
// context-tolerance station's full decision (null until that station
// runs), re-keyed here from the phase result (spec 078's
// session.marksContextTolerance derivation stays for session consumers).

import type {
  GuardSpecification,
  MarksContextToleranceDecision,
  PlacementWorklist,
} from "@keyboard-studio/contracts";
import type { OutputForm } from "@keyboard-studio/engine";

import { getDecisionSnapshot } from "../../stores/decisionStore.ts";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { decideGalleryValue } from "../../steps/galleryHost.tsx";
import type { GalleryModule } from "../types.ts";

/**
 * One touch key whose minted form disagrees with the keyboard's guard
 * specification (spec 104 FR-013 / US1 scenario 6): a mark minted `U_`
 * (it types even with no letter before it) while the specification says
 * `"swallow"`, or a guarded `T_` mark while it says `"emit"`. Computed at
 * the completion report and REPORTED through the completion payload —
 * never silently re-minted.
 */
export interface GuardReevaluationItem {
  /** The combining mark the key produces. */
  mark: string;
  /** The touch key's current id (`U_…` or `T_…`). */
  keyId: string;
  platformId: string;
  layerId: string;
  /** The form the key is minted in today. */
  currentForm: "unicode" | "guarded-t";
  /** The specification behaviour the form disagrees with. */
  specBehaviour: "swallow" | "emit";
}

/** The completion payload the module's apply consumes (D-090-11). */
export interface MarksCompletion {
  worklist: PlacementWorklist;
  outputForm: OutputForm;
  /** R10: base-plus-mark chosen over a precomposed-form base (reducer parity). */
  migrationNeeded: boolean;
  /**
   * Spec 104: marks minted before the guard specification existed whose
   * form the landed specification contradicts (US1 scenario 6). Reported,
   * never applied — MarksStepHost mirrors the list into the survey
   * session, the migrationNeeded-style channel.
   */
  guardReevaluation: readonly GuardReevaluationItem[];
}

/**
 * The marks-treatment decision value (data-model.md): the marks-series
 * answers as one composite, the completion payload once the series
 * completes, and the context-tolerance station's decision. Answer ids
 * are the existing marks_* question ids — no i18n id changes.
 */
export interface MarksTreatmentValue {
  answers: Readonly<Record<string, string | string[] | boolean | undefined>>;
  completion: MarksCompletion | null;
  contextTolerance: MarksContextToleranceDecision | null;
  /**
   * Spec 104 FR-013: the per-keyboard combining-mark guard specification
   * — the decision-registry entry the guard station records (Constitution
   * Art. IX: a registry decision, not a local survey answer). Null until
   * the guard station runs or an editor-side answer is recorded; a
   * Track 2 seed sits here with `confirmed: false` until the author
   * confirms it at the station.
   */
  guardSpecification: GuardSpecification | null;
}

/** The value before anything is recorded. */
export const EMPTY_MARKS_VALUE: MarksTreatmentValue = {
  answers: {},
  completion: null,
  contextTolerance: null,
  guardSpecification: null,
};

/**
 * Module stub for the host decide core (mirrors useInventoryDraft's
 * stubs): `decideGalleryValue` reads only these fields. A T028 test pins
 * this literal equal to the real module's fields.
 */
const MARKS_MODULE = {
  definition: { id: "marksTreatment" },
  provides: ["marks-treatment"],
  requires: ["character-inventory"],
  writes: [["groups"], ["stores"]],
  apply: () => ({}),
} as unknown as GalleryModule<MarksTreatmentValue>;

/** The recorded marks-treatment value, or undefined when none exists. */
export function getMarksTreatmentValue(): MarksTreatmentValue | undefined {
  return getDecisionSnapshot()["marks-treatment"]?.value as MarksTreatmentValue | undefined;
}

/**
 * Record a whole marks-treatment value under the marks step's
 * attribution. Used by callers outside the hosted renderer (the
 * context-tolerance apply hook's appliedFingerprint bookkeeping); the
 * renderer itself records through its host-provided onChange.
 */
export function recordMarksTreatmentValue(next: MarksTreatmentValue, stepId = "marks"): void {
  decideGalleryValue(MARKS_MODULE, next, { provenance: "asked" }, stepId, buildGalleryHostDeps());
}
