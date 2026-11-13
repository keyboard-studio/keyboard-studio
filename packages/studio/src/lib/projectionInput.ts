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
import type { CapsHandlingValue, DecisionSet } from "../decisions/decisionTypes.ts";
import { alphabetOf, isCasedAlphabet } from "../survey/caps/capsLogic.ts";
import { disabledFamilyRuleIds } from "../components/rules/disabledFamilyRules.ts";
import { deriveRuleAdditions } from "../survey/rules/ruleAdditions.ts";
import { welcomePagePath } from "./welcomeFolder.ts";
import { isOpenMode, isOpenedWithDescriptor } from "./openMode.ts";

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
  | "customCss"
  | "authoredWelcomeHtm"
  | "authoredReadmeHtm"
  | "authoredReadmeMd"
  | "authoredHelpPhp"
  | "instantiationMode"
  | "startVfs"
  | "startWelcomeConvention"
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
  /**
   * The recorded caps-handling decision for step 2.8 (spec 112), already
   * gated through {@link capsHandlingFromDecisions}; undefined when not asked.
   */
  capsHandling: CapsHandlingValue | undefined;
  baseDisplayName?: string;
  startKeyboardId?: string;
  welcomeFolderFiles?: readonly string[];
  packageFonts?: PackageFontSet;
  /** Open mode only (spec 111); see ProjectWorkingCopyVfsInput.openMode. */
  openMode?: NonNullable<ProjectWorkingCopyVfsInput["openMode"]>;
  /** A live touch layout and its uncommitted-to-JSON key edits (TouchGallery's preview). */
  liveLayoutOverride?: {
    touchLayoutJson: string | null;
    keyEditOps: readonly KeyEditOperation[];
  };
  /** The CSS step's in-progress text, ahead of the commit that writes the store (undefined = use the store's). */
  liveCssOverride?: string | null;
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

/**
 * Step 2.8's input from the decision set: the recorded caps-handling value,
 * or undefined when it was not asked. A caseless alphabet is never asked, so
 * a value left over from an earlier alphabet is ignored rather than writing a
 * store nothing needs.
 */
export function capsHandlingFromDecisions(decisions: DecisionSet): CapsHandlingValue | undefined {
  const value = decisions["caps-handling"]?.value as CapsHandlingValue | undefined;
  if (value === undefined) return undefined;
  return isCasedAlphabet(alphabetOf(decisions["character-inventory"]?.value)) ? value : undefined;
}

/**
 * The Open-mode projection options, built once for the download and the
 * preview so both place a `.kmn` change and patch the descriptor identically.
 *
 * `consentedReemit` is the author's agreement to a full re-emit of a file whose
 * change cannot be placed precisely. The download passes it only once the
 * author has agreed; the preview passes it always, so it compiles the
 * reformatted text the author would be asked to accept (it writes nothing the
 * output does not).
 */
export function openModeProjection(args: {
  identity: {
    displayName?: string | undefined;
    languages?: ReadonlyArray<{ tag: string; name?: string }> | undefined;
  } | null;
  /** The starting point's display name; null/undefined (not known) reads as "not edited". */
  startDisplayName: string | null | undefined;
  consentedReemit?: boolean;
  /** The projection feeds the preview: the re-emit warning does not claim agreement. */
  preview?: boolean;
}): NonNullable<ProjectWorkingCopyVfsInput["openMode"]> {
  const { identity, startDisplayName, consentedReemit, preview } = args;
  return {
    kps: {
      nameEdited:
        startDisplayName !== null &&
        startDisplayName !== undefined &&
        identity?.displayName !== undefined &&
        identity.displayName !== startDisplayName,
      ...(identity?.languages !== undefined ? { languages: identity.languages } : {}),
    },
    ...(consentedReemit === true ? { consentedReemit: true } : {}),
    ...(preview === true ? { preview: true } : {}),
  };
}

/**
 * Open mode: overlays the working copy's current files (`startVfs`) onto `vfs`
 * in place, so a projection starts from what the author's tools wrote rather
 * than from the keyboard as fetched. A no-op outside Open or without a
 * starting-point VFS (Copy is untouched).
 *
 * Overlay only (add / replace): a file only `vfs` holds is kept. Known limit:
 * a file the working copy no longer holds is therefore not removed from the
 * preview. Nothing removes a file from `startVfs` today; if something starts
 * to, this needs a deletion step.
 */
export function applyOpenWorkingCopyFiles(
  vfs: VirtualFS,
  instantiationMode: WorkingCopyState["instantiationMode"],
  startVfs: VirtualFS | null | undefined,
): void {
  if (!isOpenMode(instantiationMode) || startVfs === null || startVfs === undefined) return;
  for (const entry of startVfs.entries()) {
    vfs.set(entry.path, entry.content, entry.isBinary);
  }
}

export function projectionInputFromState(
  state: ProjectionState,
  extras: ProjectionExtras,
): ProjectWorkingCopyVfsInput {
  const { liveLayoutOverride, liveCssOverride, marksTreatment, capsHandling, ...callSite } = extras;
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
    customCss: liveCssOverride !== undefined ? liveCssOverride : state.customCss,
    authoredDocs: {
      authoredWelcomeHtm: state.authoredWelcomeHtm,
      authoredReadmeHtm: state.authoredReadmeHtm,
      authoredReadmeMd: state.authoredReadmeMd,
      authoredHelpPhp: state.authoredHelpPhp,
    },
    // Open is read from the store, not from `openMode`, so the authored welcome
    // page lands at the same path on every caller whether or not it passes one.
    welcomePath: welcomePagePath(
      isOpenedWithDescriptor(state.instantiationMode, state.startVfs, callSite.keyboardId),
      state.startWelcomeConvention,
    ),
    marksGuards: marksGuardsFromValue(marksTreatment),
    contextToleranceOverlay: state.contextToleranceOverlay?.overlay ?? null,
    capsHandling: capsHandling ?? null,
    ruleAdditions: deriveRuleAdditions(state.ir, state.startIr),
  };
}
