// projectionInput — the one place the working-copy store becomes a projection input.
//
// The OSK preview (hooks/useWorkingCopyTransform.ts) and the download
// (lib/serializeWorkingCopy.ts) both call projectWorkingCopyVfs. They used to
// build its input by hand, and the download silently omitted the fallback
// policy, the disabled rule families and the carved-touch keep-inert set, so
// the preview could show a keyboard the zip did not contain. Both now take
// every store-derived field from projectionInputFromState, and a field added
// here reaches both paths at once.
//
// The marks-treatment decision value is the one decision the projection reads
// (spec 106 FR-010: the mark guards are generated in step 2.6, never in the
// working IR). It is a required extra so neither caller can forget it: the
// download reads it with getMarksTreatmentValue(), the preview through a
// decision-store selector.
//
// What stays with the caller (ProjectionExtras) is what is genuinely
// call-site specific: the VFS it projects onto, the resolved ids, the pattern
// lookup, the identity overlay it has already resolved, and the download-only
// package files. The touch layout is the one store field a caller may
// override: TouchGallery previews its in-progress layout and committed
// key-edit ops through `liveLayoutOverride`. Everywhere else the store's
// `touchLayoutJson` already carries the committed key edits (TouchGallery
// splices each op into it on commit), so the default `keyEditOps` is empty;
// replaying the store's overlay on top of it would apply every edit twice.

import type {
  KeyboardIR,
  MechanismAssignment,
  PackageFontSet,
  Pattern,
  VirtualFS,
} from "@keyboard-studio/contracts";
import type { KeyEditOperation } from "@keyboard-studio/engine";
import type { WorkingCopyState } from "../stores/workingCopyStore.ts";
import type {
  IdentityOverlay,
  MarksGuardsInput,
  ProjectWorkingCopyVfsInput,
} from "./projectWorkingCopyVfs.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { disabledFamilyRuleIds } from "../components/rules/disabledFamilyRules.ts";
import { deriveRuleAdditions } from "../survey/rules/ruleAdditions.ts";

/** The store fields the projection reads. `startIr` must already be set. */
export type ProjectionState = Pick<
  WorkingCopyState,
  | "ir"
  | "deletedNodeIds"
  | "deletedItemIds"
  | "carveChars"
  | "deletedTouchKeyIds"
  | "disabledFamilyIds"
  | "fallbackPolicy"
  | "carveTouchKeepInert"
  | "deadkeyOverlay"
  | "contextToleranceOverlay"
  | "touchLayoutJson"
> & { startIr: KeyboardIR };

/** The call-site inputs the store cannot supply. */
export interface ProjectionExtras {
  vfs: VirtualFS;
  keyboardId: string;
  targetKeyboardId?: string;
  assignments: ReadonlyArray<MechanismAssignment>;
  getPattern: (id: string) => Pattern | undefined;
  identity: IdentityOverlay | null;
  /** The recorded marks-treatment value, or undefined when none is recorded. */
  marksTreatment: MarksTreatmentValue | undefined;
  baseDisplayName?: string;
  welcomeFolderFiles?: readonly string[];
  packageFonts?: PackageFontSet;
  /** A live touch layout and its uncommitted-to-JSON key edits (TouchGallery's preview). */
  liveLayoutOverride?: {
    touchLayoutJson: string | null;
    keyEditOps: readonly KeyEditOperation[];
  };
}

/**
 * Step 2.6's input from the marks-treatment value: null until the series
 * completes. Buffer-start behaviour is per mark (issue #2374) and travels on
 * the worklist's `bareMarkAllowed` channel — no keyboard-wide answer.
 */
export function marksGuardsFromValue(value: MarksTreatmentValue | undefined): MarksGuardsInput | null {
  const completion = value?.completion;
  if (completion === undefined || completion === null) return null;
  return {
    worklist: completion.worklist,
    outputForm: completion.outputForm,
    ...(completion.backspace !== undefined ? { backspace: completion.backspace } : {}),
    ...(completion.stacks !== undefined ? { stacks: completion.stacks } : {}),
  };
}

export function projectionInputFromState(
  state: ProjectionState,
  extras: ProjectionExtras,
): ProjectWorkingCopyVfsInput {
  const { liveLayoutOverride, marksTreatment, ...callSite } = extras;
  // spec 082 FR-018: disabled families' member rules are removed outright.
  // They join the deletion set and are exempt from the fallback-policy
  // expansion, which would otherwise carve them instead.
  const disabledRuleIds = disabledFamilyRuleIds(state.ir, state.disabledFamilyIds);
  const touchLayoutJson = liveLayoutOverride !== undefined
    ? liveLayoutOverride.touchLayoutJson
    : state.touchLayoutJson;
  return {
    ...callSite,
    startIr: state.startIr,
    deletedNodeIds: state.deletedNodeIds,
    deletedItemIds: disabledRuleIds.size === 0
      ? state.deletedItemIds
      : new Set([...state.deletedItemIds, ...disabledRuleIds]),
    ...(disabledRuleIds.size > 0 ? { suppressionExemptIds: disabledRuleIds } : {}),
    carveChars: state.carveChars,
    deletedTouchKeyIds: state.deletedTouchKeyIds,
    fallbackPolicy: state.fallbackPolicy,
    // T020 (FR-023): the store array is NFC-normalized at write time.
    ...(state.carveTouchKeepInert.length > 0
      ? { carveTouchKeepInert: new Set(state.carveTouchKeepInert) }
      : {}),
    keyEditOps: liveLayoutOverride?.keyEditOps ?? [],
    deadkeyOps: state.deadkeyOverlay.ops,
    touchLayoutJson,
    marksGuards: marksGuardsFromValue(marksTreatment),
    contextToleranceOverlay: state.contextToleranceOverlay?.overlay ?? null,
    ruleAdditions: deriveRuleAdditions(state.ir, state.startIr),
  };
}
