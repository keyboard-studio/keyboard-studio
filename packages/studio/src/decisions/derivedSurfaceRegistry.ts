// derivedSurfaceRegistry — spec 105 Phase 0 equivalence-gate registry
// (spec.md FR-010, Key Entities: "Derived-surface registry").
//
// The gate's explicit list, following the decisionIRConsistency pattern:
// every inventoried working-copy write surface is either
// equivalence-proven or listed as pending with its phase — absence from
// this registry is a gate failure, never a default. Matthew's ruling
// (2026-10-19, Option A): the working copy becomes purely derived; this
// registry gates that future and changes no behaviour today.
//
// Vocabulary reconciliation (the Phase 0 fragments use two vocabularies):
//   - inventory-carve-deadkeys.md (I2) "SOURCE" means replay can
//     reconstruct the state at step completion, via a module apply() or
//     the carve fold beside apply().
//   - inventory-galleries-vfs-identity.md (I3) "BRIDGE" means the state
//     was snapshotted FROM the working copy at step completion.
// A surface is "equivalence-proven" here ONLY if replay from decisions
// reproduces its state today under the gate's own arm
// (derivedEquivalence.test.ts arm C). A completion-snapshot surface —
// even one whose snapshot replay does reproduce the completed state
// (deadkeys, carve) — stays "pending": its live edit-time slices are
// not yet decision-derived, and its phase must still close that gap.
// The snapshot fact is carried in the surface's evidence, not its status.

export type DerivedSurfaceStatus =
  | "equivalence-proven"
  | "pending"
  | "starting-point"
  | "session-only"
  | "dormant-no-live-writer";

export type WorkingCopyBackboneClass =
  | "STARTING-POINT"
  | "DECISION-DERIVED"
  | "OVERLAY-CHANNEL"
  | "EDITOR-AUTHORED"
  | "SURVEY-SLOT"
  | "EPHEMERAL"
  | "UNCLASSIFIED";

export interface WorkingCopyMemberClassification {
  kind: "field" | "action";
  class: WorkingCopyBackboneClass;
}

export interface DerivedSurface {
  id: string;
  label: string;
  /** Programme phase that must close this surface; null for the proven arm. */
  phase: number | null;
  status: DerivedSurfaceStatus;
  /** WorkingCopyState actions this surface writes through. */
  storeActions: readonly string[];
  /** WorkingCopyState fields this surface writes (covered beside actions). */
  fields: readonly string[];
  /** Decision ids that source this surface today; [] = none / open set. */
  decisionIds: readonly string[];
  /** Short evidence strings: fragment file + section, plus gate notes. */
  evidence: readonly string[];
}

export const DERIVED_SURFACES: readonly DerivedSurface[] = [
  {
    id: "survey-decision-replay",
    label: "Survey question-module path through rebuildWorkingCopyFromStores",
    phase: 0,
    status: "equivalence-proven",
    // Writes via replay install (installRebuiltState), not a surface
    // action of its own — the install path is replay itself.
    storeActions: [],
    fields: ["ir", "identity", "attribution", "helpDocs", "historyEntryState"],
    // Open set: every registry-provided decision id participates; the
    // gate's arm C proves the fold over whichever ids are recorded.
    decisionIds: [],
    evidence: [
      "inventory-store-backbone.md §3: applyWorkingCopyPatch sink channels ir/identity/attribution/helpDocs/historyEntryState",
      "inventory-galleries-vfs-identity.md §(c) C2: rebuild installRebuiltState is HAS-DECISION-SOURCE",
      "Gate arm C (derivedEquivalence.test.ts): rebuildWorkingCopyFromStores installs state deep-equal to the manual replay fold — equivalence-proven under the gate's own arm",
    ],
  },
  {
    id: "starting-point-instantiation",
    label: "Starting-point instantiation and base-artifact seeding",
    phase: 1,
    status: "starting-point",
    storeActions: [
      "instantiateFromStart",
      "instantiateFromExisting",
      "setLicenseUnparseable",
      "setStartLicenseText",
      "setStartWelcomeImages",
      "setStartWelcomeConvention",
      "setStartWelcomeHtmText",
      "setStartHelpPhpText",
      "setBaseHelpPhpTextForExtraction",
      "setStartReadmeMdText",
      "setStartHistoryMdText",
      "setStartDocCssTexts",
      "setBaselineDocFindings",
      "setStartDocProfile",
    ],
    fields: [
      "instantiationMode",
      "startKeyboard",
      "startVfs",
      "startIr",
      "licenseUnparseable",
      "startLicenseText",
      "startWelcomeImages",
      "startWelcomeConvention",
      "startWelcomeImagesDropped",
      "startWelcomeHtmText",
      "startHelpPhpText",
      "baseHelpPhpTextForExtraction",
      "startReadmeMdText",
      "startHistoryMdText",
      "startDocCssTexts",
      "startDocProfile",
      "baselineDocFindings",
      "removalCapabilities",
    ],
    decisionIds: ["base-keyboard"],
    evidence: [
      "inventory-galleries-vfs-identity.md §(d) D2/D3: instantiateFromStart/instantiateFromExisting seed the starting-point slots (BRIDGE: gated by the base-keyboard decision, seeded state is not a decision value)",
      "inventory-galleries-vfs-identity.md §(c) C5/C6: base-artifact setters in hooks/useKeyboardArtifact.ts seed the start* slices beside instantiation",
      "inventory-galleries-vfs-identity.md §(c) C7 + §(a) E2: setStartDocProfile records the focused base's doc profile at selection",
      "inventory-store-backbone.md §1: the STARTING-POINT backbone class (33 members)",
    ],
  },
  {
    id: "deadkeys",
    label: "Deadkey editor (op log + working IR)",
    phase: 2,
    status: "pending",
    storeActions: ["commitDeadkeyOp", "setWorkingIR"],
    fields: ["deadkeyOverlay", "ir"],
    decisionIds: ["deadkeys-defined"],
    evidence: [
      "inventory-carve-deadkeys.md §B: real apply() replays the op log at completion (deadkeys-defined, HAS-DECISION-SOURCE at completion)",
      "inventory-carve-deadkeys.md §B caveat: the live deadkeyOverlay slice is not reinstalled by rebuild — completion-snapshot surface, therefore pending, not equivalence-proven",
      "inventory-galleries-vfs-identity.md §(a) X3: BRIDGE — WC-first at edit time, completion snapshot is the op log itself",
    ],
  },
  {
    id: "carve",
    label: "Carve editor overlay",
    phase: 3,
    status: "pending",
    storeActions: [
      "cascadeDelete",
      "cascadeRestore",
      "keepAll",
      "restoreAll",
      "deleteNode",
      "restoreNode",
      "deleteItem",
      "restoreItem",
      "toggleFamilyDisabled",
      // Registered ONLY here (spec 105 Phase 0 task ruling): the
      // dormant-slices entry names it in evidence but does not claim it.
      "setCarveTouchKeepInert",
    ],
    fields: [
      "deletedNodeIds",
      "deletedItemIds",
      "disabledFamilyIds",
      "carveChars",
      "undoStack",
      "carveTouchKeepInert",
    ],
    decisionIds: ["carved-layout"],
    evidence: [
      "inventory-carve-deadkeys.md §A.0/§A: the carved-layout fold reconstructs the carve slice at completion (SOURCE via replay fold, not apply())",
      "inventory-carve-deadkeys.md §A: edit-time writes are direct WC writes; undoStack and carveTouchKeepInert sit outside the fold — pending",
      "inventory-galleries-vfs-identity.md §(a) X1/X2: BRIDGE — snapshotted from the WC at completion into carved-layout",
    ],
  },
  {
    id: "physical-layout",
    label: "Physical (mechanisms) assign loop",
    phase: 4,
    status: "pending",
    storeActions: [
      "recordAssignments",
      "unflagCharForSequence",
      "lockDesktop",
      "unlockDesktop",
    ],
    fields: ["desktopLocked", "sequenceFlaggedChars"],
    decisionIds: ["physical-layout"],
    evidence: [
      "inventory-carve-deadkeys.md §C: physical-layout is RECORD-ONLY — snapshotted from the WC at completion, its apply() is a no-op and replay has no fold for it",
      "inventory-galleries-vfs-identity.md §(a) A1/C1: BRIDGE-ONLY (recordAssignments) and completion effects (lockDesktop) are not decision apply work",
    ],
  },
  {
    id: "touch-layout",
    label: "Touch assign loop (key edits, draft, layout JSON)",
    phase: 5,
    status: "pending",
    storeActions: [
      "commitKeyEdit",
      "undoKeyEdit",
      "deleteTouchKey",
      "restoreTouchKey",
      // Read accessor for the same EDITOR-AUTHORED slice
      // (deletedTouchKeyIds); registered so every authored member of
      // the slice is named by its surface.
      "isTouchKeyDeleted",
      "commitTouchKeyRename",
      "setTouchDraft",
      "setTouchLayoutJson",
      "setWorkingIR",
    ],
    fields: ["keyEditOverlay", "deletedTouchKeyIds", "touchDraft", "touchLayoutJson"],
    decisionIds: ["touch-layout"],
    evidence: [
      "inventory-carve-deadkeys.md §D: touch-layout is RECORD-ONLY — ops + deleted ids snapshotted at completion, apply() is a no-op, no replay fold",
      "inventory-galleries-vfs-identity.md §(a) T1/T6/T7: touchDraft, touchLayoutJson and direct setWorkingIR promotions are unsourced (NO-DECISION-SOURCE)",
    ],
  },
  {
    id: "touch-identity-104",
    label: "Spec 104 touch key-identity records",
    phase: 6,
    status: "pending",
    storeActions: ["setTouchKeyIdentity", "recordKeyIdentityDecision", "recordTransplant"],
    fields: ["touchKeyIdentity", "keyIdentityDecisions", "keyTransplants"],
    decisionIds: [],
    evidence: [
      "inventory-carve-deadkeys.md §D D7: spec-104 records live in WC slices (touchKeyIdentity, keyIdentityDecisions), not the DecisionSet — NO-DECISION-SOURCE in DecisionSet terms",
      "inventory-galleries-vfs-identity.md §(a) T9: the same records, stored in a WC slice, not in the DS; recordTransplant has no live caller (see also dormant-slices)",
      "inventory-store-backbone.md §1: touchKeyIdentity and keyIdentityDecisions are EDITOR-AUTHORED",
    ],
  },
  {
    id: "fallback-policy",
    label: "Keyboard-wide fallback policy (Assign Mechanisms step)",
    phase: 3,
    status: "pending",
    storeActions: ["setFallbackPolicy"],
    fields: ["fallbackPolicy"],
    // Not sourced from the carved-layout decision: the policy is an
    // author-set working-copy setting persisted in the draft. Recording it
    // in the carve value would let a replay rebuild revert a later choice.
    decisionIds: [],
    evidence: [
      "specs/076-rule-behaviours/fallback-surface-design.md §5: one keyboard-wide setting replaces the per-combination carveDispositions store and the closed-keyboard card",
      "EDITOR-AUTHORED: written by the fallback-policy section of the Assign Mechanisms step, no decision record",
    ],
  },
  {
    id: "docs-identity-overlays",
    label: "Docs / identity overlays and the raw-KMN editor",
    phase: 7,
    status: "pending",
    storeActions: [
      "setIdentity",
      "setDocFixProposals",
      "setChartPreference",
      "setStartHolderOverride",
      "setHistoryEntryState",
      "setContextToleranceOverlay",
    ],
    fields: [
      "identity",
      "docFixProposals",
      "chartPreference",
      "startHolderOverride",
      "historyEntryState",
      "contextToleranceOverlay",
    ],
    decisionIds: [],
    evidence: [
      "inventory-galleries-vfs-identity.md §(c) C1: TrackOneIdentityPanel calls setIdentity per keystroke, no decision record",
      "inventory-galleries-vfs-identity.md §(b) B7/B8: setDocFixProposals and setChartPreference are NO-DECISION-SOURCE",
      "inventory-galleries-vfs-identity.md §(c) C3/C4: setHistoryEntryState mount write (BRIDGE) and setStartHolderOverride (NONE)",
      "inventory-store-backbone.md §1: contextToleranceOverlay is EDITOR-AUTHORED, written via setContextToleranceOverlay",
      "inventory-galleries-vfs-identity.md §(b) B3: the raw-KMN editor's pipeline-VFS edits are NO-DECISION-SOURCE (not a WC store action — named here as this surface's evidence, claimed by no storeActions entry)",
    ],
  },
  {
    id: "survey-residue-phaseResults",
    label: "Survey residue: phaseResults slot and recordPhase",
    phase: 8,
    status: "pending",
    storeActions: [
      "recordPhase",
      "setIrAxes",
      "syncRemapPostureFromIdentity",
      "flagCharForSequence",
    ],
    fields: ["phaseResults", "irAxes", "session"],
    decisionIds: [],
    evidence: [
      "inventory-store-backbone.md §1: phaseResults/irAxes/session are SURVEY-SLOT; session is derived within the slot via mergePhaseResults(irAxes, phaseResults)",
      "spec.md FR-004: the phaseResults slot and recordPhase must be deleted; what the session derives from them must be derived from the decision set instead",
    ],
  },
  {
    id: "guard-specification-slice",
    label: "Guard specification WC slice (dormant)",
    phase: 9,
    status: "dormant-no-live-writer",
    storeActions: ["setGuardSpecification"],
    fields: ["guardSpecification"],
    decisionIds: ["marks-treatment"],
    evidence: [
      "inventory-store-backbone.md §1: guardSpecification + setGuardSpecification are UNCLASSIFIED — the setter has zero callers repo-wide; the live guard specification lives in the marks-treatment decision value",
      "inventory-galleries-vfs-identity.md §(a) T9: live guard specifications also ride inside touchKeyIdentity.guardSpecifications",
    ],
  },
  {
    id: "dormant-slices",
    label: "Dormant WC slices: keyTransplants and guardSpecification",
    phase: 9,
    status: "dormant-no-live-writer",
    // setCarveTouchKeepInert is deliberately NOT repeated here: it is
    // registered only under carve (above) to avoid double-coverage;
    // its field carveTouchKeepInert is likewise dormant (no live
    // writer, no carved-layout value field — D-090-31).
    storeActions: ["recordTransplant", "setGuardSpecification"],
    fields: ["keyTransplants", "guardSpecification"],
    decisionIds: [],
    evidence: [
      "inventory-store-backbone.md §1: keyTransplants + recordTransplant are UNCLASSIFIED — recordTransplant has 0 callers anywhere in the repo; live transplant records go into touchKeyIdentity via setTouchKeyIdentity",
      "inventory-store-backbone.md §1: guardSpecification + setGuardSpecification are UNCLASSIFIED — zero callers repo-wide (see also guard-specification-slice)",
      "inventory-carve-deadkeys.md §A.0: carveTouchKeepInert has no value field (D-090-31) and no live writer — dormant, registered under carve",
    ],
  },
];

/**
 * Every member of WorkingCopyState, classified by its backbone source.
 * Transcribed exactly from inventory-store-backbone.md §1 (130 members:
 * 56 fields + 74 actions; class counts STARTING-POINT 33,
 * DECISION-DERIVED 26, OVERLAY-CHANNEL 8, EDITOR-AUTHORED 24,
 * SURVEY-SLOT 15, EPHEMERAL 18, UNCLASSIFIED 6). The gate's census arm
 * verifies these keys against the live interface, so a transcription
 * slip — or a new store member — fails loudly.
 */
export const WORKING_COPY_MEMBER_CLASSIFICATION: Readonly<
  Record<string, WorkingCopyMemberClassification>
> = {
  instantiationMode: { kind: "field", class: "STARTING-POINT" },
  startKeyboard: { kind: "field", class: "STARTING-POINT" },
  startVfs: { kind: "field", class: "STARTING-POINT" },
  startIr: { kind: "field", class: "STARTING-POINT" },
  identity: { kind: "field", class: "OVERLAY-CHANNEL" },
  attribution: { kind: "field", class: "OVERLAY-CHANNEL" },
  licenseUnparseable: { kind: "field", class: "STARTING-POINT" },
  startHolderOverride: { kind: "field", class: "EDITOR-AUTHORED" },
  startLicenseText: { kind: "field", class: "STARTING-POINT" },
  helpDocs: { kind: "field", class: "OVERLAY-CHANNEL" },
  startWelcomeHtmText: { kind: "field", class: "STARTING-POINT" },
  startHelpPhpText: { kind: "field", class: "STARTING-POINT" },
  baseHelpPhpTextForExtraction: { kind: "field", class: "STARTING-POINT" },
  startReadmeMdText: { kind: "field", class: "STARTING-POINT" },
  startHistoryMdText: { kind: "field", class: "STARTING-POINT" },
  startDocCssTexts: { kind: "field", class: "STARTING-POINT" },
  startWelcomeImages: { kind: "field", class: "STARTING-POINT" },
  startWelcomeConvention: { kind: "field", class: "STARTING-POINT" },
  startWelcomeImagesDropped: { kind: "field", class: "STARTING-POINT" },
  historyEntryState: { kind: "field", class: "OVERLAY-CHANNEL" },
  chartPreference: { kind: "field", class: "EDITOR-AUTHORED" },
  docFixProposals: { kind: "field", class: "EDITOR-AUTHORED" },
  touchKeyIdentity: { kind: "field", class: "EDITOR-AUTHORED" },
  startDocProfile: { kind: "field", class: "STARTING-POINT" },
  baselineDocFindings: { kind: "field", class: "STARTING-POINT" },
  ir: { kind: "field", class: "DECISION-DERIVED" },
  removalCapabilities: { kind: "field", class: "STARTING-POINT" },
  deletedNodeIds: { kind: "field", class: "DECISION-DERIVED" },
  disabledFamilyIds: { kind: "field", class: "DECISION-DERIVED" },
  deletedItemIds: { kind: "field", class: "DECISION-DERIVED" },
  deletedTouchKeyIds: { kind: "field", class: "EDITOR-AUTHORED" },
  carveChars: { kind: "field", class: "DECISION-DERIVED" },
  undoStack: { kind: "field", class: "EPHEMERAL" },
  fallbackPolicy: { kind: "field", class: "EDITOR-AUTHORED" },
  carveTouchKeepInert: { kind: "field", class: "UNCLASSIFIED" },
  setCarveTouchKeepInert: { kind: "action", class: "UNCLASSIFIED" },
  phaseResults: { kind: "field", class: "SURVEY-SLOT" },
  irAxes: { kind: "field", class: "SURVEY-SLOT" },
  session: { kind: "field", class: "SURVEY-SLOT" },
  desktopLocked: { kind: "field", class: "SURVEY-SLOT" },
  sequenceFlaggedChars: { kind: "field", class: "SURVEY-SLOT" },
  touchLayoutJson: { kind: "field", class: "SURVEY-SLOT" },
  touchDraft: { kind: "field", class: "EDITOR-AUTHORED" },
  galleryIntrosSeen: { kind: "field", class: "EPHEMERAL" },
  keyEditOverlay: { kind: "field", class: "EDITOR-AUTHORED" },
  deadkeyOverlay: { kind: "field", class: "EDITOR-AUTHORED" },
  touchEditorMode: { kind: "field", class: "EPHEMERAL" },
  staleSteps: { kind: "field", class: "EPHEMERAL" },
  validatorFindings: { kind: "field", class: "EPHEMERAL" },
  keyIdentityDecisions: { kind: "field", class: "EDITOR-AUTHORED" },
  keyTransplants: { kind: "field", class: "UNCLASSIFIED" },
  guardSpecification: { kind: "field", class: "UNCLASSIFIED" },
  contextTolerance: { kind: "field", class: "EPHEMERAL" },
  contextToleranceOverlay: { kind: "field", class: "EDITOR-AUTHORED" },
  contextNormalizationStep: { kind: "field", class: "EPHEMERAL" },
  axisFills: { kind: "field", class: "EPHEMERAL" },
  setIR: { kind: "action", class: "DECISION-DERIVED" },
  setWorkingIR: { kind: "action", class: "DECISION-DERIVED" },
  clearIR: { kind: "action", class: "DECISION-DERIVED" },
  deleteNode: { kind: "action", class: "DECISION-DERIVED" },
  toggleFamilyDisabled: { kind: "action", class: "DECISION-DERIVED" },
  undoDelete: { kind: "action", class: "EPHEMERAL" },
  restoreNode: { kind: "action", class: "DECISION-DERIVED" },
  isDeleted: { kind: "action", class: "DECISION-DERIVED" },
  deleteItem: { kind: "action", class: "DECISION-DERIVED" },
  restoreItem: { kind: "action", class: "DECISION-DERIVED" },
  isItemDeleted: { kind: "action", class: "DECISION-DERIVED" },
  deleteTouchKey: { kind: "action", class: "EDITOR-AUTHORED" },
  restoreTouchKey: { kind: "action", class: "EDITOR-AUTHORED" },
  isTouchKeyDeleted: { kind: "action", class: "EDITOR-AUTHORED" },
  keepAll: { kind: "action", class: "DECISION-DERIVED" },
  restoreAll: { kind: "action", class: "DECISION-DERIVED" },
  cascadeDelete: { kind: "action", class: "DECISION-DERIVED" },
  cascadeRestore: { kind: "action", class: "DECISION-DERIVED" },
  setFallbackPolicy: { kind: "action", class: "EDITOR-AUTHORED" },
  recordPhase: { kind: "action", class: "SURVEY-SLOT" },
  recordAssignments: { kind: "action", class: "SURVEY-SLOT" },
  setIrAxes: { kind: "action", class: "SURVEY-SLOT" },
  syncRemapPostureFromIdentity: { kind: "action", class: "SURVEY-SLOT" },
  lockDesktop: { kind: "action", class: "SURVEY-SLOT" },
  unlockDesktop: { kind: "action", class: "SURVEY-SLOT" },
  setTouchLayoutJson: { kind: "action", class: "SURVEY-SLOT" },
  setTouchDraft: { kind: "action", class: "EDITOR-AUTHORED" },
  markGalleryIntroSeen: { kind: "action", class: "EPHEMERAL" },
  commitKeyEdit: { kind: "action", class: "EDITOR-AUTHORED" },
  undoKeyEdit: { kind: "action", class: "EDITOR-AUTHORED" },
  commitDeadkeyOp: { kind: "action", class: "EDITOR-AUTHORED" },
  commitTouchKeyRename: { kind: "action", class: "EDITOR-AUTHORED" },
  setTouchEditorMode: { kind: "action", class: "EPHEMERAL" },
  flagCharForSequence: { kind: "action", class: "SURVEY-SLOT" },
  unflagCharForSequence: { kind: "action", class: "SURVEY-SLOT" },
  reset: { kind: "action", class: "EPHEMERAL" },
  instantiateFromStart: { kind: "action", class: "STARTING-POINT" },
  instantiateFromExisting: { kind: "action", class: "STARTING-POINT" },
  setIdentity: { kind: "action", class: "OVERLAY-CHANNEL" },
  setAttribution: { kind: "action", class: "OVERLAY-CHANNEL" },
  setLicenseUnparseable: { kind: "action", class: "STARTING-POINT" },
  setStartHolderOverride: { kind: "action", class: "EDITOR-AUTHORED" },
  setStartLicenseText: { kind: "action", class: "STARTING-POINT" },
  setHelpDocs: { kind: "action", class: "OVERLAY-CHANNEL" },
  setStartWelcomeHtmText: { kind: "action", class: "STARTING-POINT" },
  setStartHelpPhpText: { kind: "action", class: "STARTING-POINT" },
  setBaseHelpPhpTextForExtraction: { kind: "action", class: "STARTING-POINT" },
  setStartReadmeMdText: { kind: "action", class: "STARTING-POINT" },
  setStartHistoryMdText: { kind: "action", class: "STARTING-POINT" },
  setStartDocCssTexts: { kind: "action", class: "STARTING-POINT" },
  setStartWelcomeImages: { kind: "action", class: "STARTING-POINT" },
  setStartWelcomeConvention: { kind: "action", class: "STARTING-POINT" },
  setHistoryEntryState: { kind: "action", class: "OVERLAY-CHANNEL" },
  setChartPreference: { kind: "action", class: "EDITOR-AUTHORED" },
  setDocFixProposals: { kind: "action", class: "EDITOR-AUTHORED" },
  setTouchKeyIdentity: { kind: "action", class: "EDITOR-AUTHORED" },
  setStartDocProfile: { kind: "action", class: "STARTING-POINT" },
  setBaselineDocFindings: { kind: "action", class: "STARTING-POINT" },
  isInstantiated: { kind: "action", class: "STARTING-POINT" },
  markStale: { kind: "action", class: "EPHEMERAL" },
  clearStale: { kind: "action", class: "EPHEMERAL" },
  setValidatorFindings: { kind: "action", class: "EPHEMERAL" },
  recordKeyIdentityDecision: { kind: "action", class: "EDITOR-AUTHORED" },
  recordTransplant: { kind: "action", class: "UNCLASSIFIED" },
  setGuardSpecification: { kind: "action", class: "UNCLASSIFIED" },
  setContextTolerance: { kind: "action", class: "EPHEMERAL" },
  setContextToleranceOverlay: { kind: "action", class: "EDITOR-AUTHORED" },
  setContextNormalizationStep: { kind: "action", class: "EPHEMERAL" },
  setAxisFills: { kind: "action", class: "EPHEMERAL" },
};

/**
 * The coverage check arm B/E share: every EDITOR-AUTHORED or
 * UNCLASSIFIED member must be claimed by at least one surface.
 *   - an action is covered when a surface names it in `storeActions`;
 *   - a field is covered when a surface names it in `fields`, or names
 *     its conventional setter (`set` + capitalised field name) in
 *     `storeActions` — the setter is its writing action.
 * Pure: the self-test (arm E) feeds it a planted member and expects
 * that member back. Returns the uncovered member names, sorted.
 */
export function uncoveredAuthoredMembers(
  map: Readonly<Record<string, WorkingCopyMemberClassification>>,
  surfaces: readonly DerivedSurface[],
): string[] {
  const coveredActions = new Set<string>();
  const coveredFields = new Set<string>();
  for (const surface of surfaces) {
    for (const action of surface.storeActions) coveredActions.add(action);
    for (const field of surface.fields) coveredFields.add(field);
  }
  const uncovered: string[] = [];
  for (const [name, info] of Object.entries(map)) {
    if (info.class !== "EDITOR-AUTHORED" && info.class !== "UNCLASSIFIED") continue;
    if (info.kind === "action") {
      if (!coveredActions.has(name)) uncovered.push(name);
    } else {
      const setter = `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      if (!coveredFields.has(name) && !coveredActions.has(name) && !coveredActions.has(setter)) {
        uncovered.push(name);
      }
    }
  }
  return uncovered.sort();
}
