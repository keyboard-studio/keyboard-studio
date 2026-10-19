# Spec 105 Phase 0 — Inventory I1: workingCopyStore backbone census

Repo: `~/workspace/ks-105-plan`, branch `km/105-derived-working-copy-plan`, HEAD `d9e3d63abca5fac17a23f9bf20ce5d145aeedcd0` (origin/dev). All line numbers are in `packages/studio/src/stores/workingCopyStore.ts` unless another file is named. Method: `rg` is the authority; the interface was enumerated mechanically (every member at two-space indent between `export interface WorkingCopyState` :398 and its closing brace :1464), and the field/action split was cross-checked against the `WorkingCopyData` Omit list (:1686–1764), which names exactly 74 actions.

## Headline counts

- **Total members: 130** — 56 fields + 74 actions.
- STARTING-POINT: **33** (18 fields + 15 actions)
- DECISION-DERIVED: **26** (7 fields + 19 actions)
- OVERLAY-CHANNEL: **8** (4 fields + 4 actions)
- EDITOR-AUTHORED: **24** (10 fields + 14 actions)
- SURVEY-SLOT: **15** (6 fields + 9 actions)
- EPHEMERAL: **18** (8 fields + 10 actions)
- UNCLASSIFIED: **6** (3 fields + 3 actions)

Every count above is the count of table rows in §1 carrying that classification (the table IS the count). Actions are classified by the classification of the state they principally write/read, except where a note says otherwise (undoDelete → its undoStack; reset → lifecycle). Caller column method: `rg -l -w <name> packages/studio/src -g '*.ts' -g '*.tsx'`, excluding `*.test.*`, `**/test/**`, `test-setup.ts`, and the store file itself — i.e. production files *referencing* the name (a call, a selector, a deps-wiring entry, or a doc reference), with the top referencing directories. Generic names (`reset`, `setIR`) collide with other stores' members; those rows are flagged in place.

## 1. WorkingCopyState — complete member table

| Member | Kind | Line | Classification | Evidence (principal writers / source) | Production callers (actions only) |
|---|---|---|---|---|---|
| instantiationMode | field | 405 | STARTING-POINT | Set only by instantiateFromStart/instantiateFromExisting in the store impl (and reset); records which authoring track created the copy. | — |
| startKeyboard | field | 409 | STARTING-POINT | Set by instantiateFromStart/instantiateFromExisting (opts/base argument); null until instantiation. | — |
| startVfs | field | 411 | STARTING-POINT | Set by instantiateFromStart/instantiateFromExisting from opts.vfs; snapshot serializes it as startVfsEntries. | — |
| startIr | field | 413 | STARTING-POINT | Set by instantiateFromStart/instantiateFromExisting from opts.ir (after deriveFacets); it is also replay's starting point (rebuildWorkingCopy reads wc.startIr). | — |
| identity | field | 422 | OVERLAY-CHANNEL | Patch channel `identity` (survey/types.ts:220). Writes via applyWorkingCopyPatch sink AND directly: instantiate* seeds/preserves it, editors/panels/TrackOneIdentityPanel.tsx:107,122 calls setIdentity on every change; rebuild install also writes it (rebuildWorkingCopy.ts:288). | — |
| attribution | field | 440 | OVERLAY-CHANNEL | Patch channel `attribution` (survey/types.ts:222). Production writes found only via the two sink compositions (StudioShell.tsx:913, lib/galleryHostDeps.ts:32) and rebuild install (rebuildWorkingCopy.ts:289) — no other direct setAttribution caller in production code. | — |
| licenseUnparseable | field | 449 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| startHolderOverride | field | 458 | EDITOR-AUTHORED | Author-typed escape hatch: hooks/usePreviewArtifact.ts resolveStartHolder (~405–413) calls setStartHolderOverride(trimmed) from the download-block UI, then retries. No decision source. | — |
| startLicenseText | field | 473 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| helpDocs | field | 484 | OVERLAY-CHANNEL | Patch channel `helpDocs` (survey/types.ts:224). Production writes found only via the two sink compositions (StudioShell.tsx:914, lib/galleryHostDeps.ts:33) and rebuild install (rebuildWorkingCopy.ts:290). | — |
| startWelcomeHtmText | field | 496 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| startHelpPhpText | field | 502 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| baseHelpPhpTextForExtraction | field | 518 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. Extraction-only reader: lib/baseHelpTroubleshooting.ts. | — |
| startReadmeMdText | field | 526 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| startHistoryMdText | field | 532 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| startDocCssTexts | field | 543 | STARTING-POINT | Nulled by instantiate*, then written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| startWelcomeImages | field | 551 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. setStartWelcomeImages also clears startWelcomeImagesDropped (store impl). | — |
| startWelcomeConvention | field | 557 | STARTING-POINT | Written at base load by hooks/useKeyboardArtifact.ts (scaffold/fetch result setters, ~1104–1186), alongside the instantiate* slots; no decision source. | — |
| startWelcomeImagesDropped | field | 568 | STARTING-POINT | Derived from the starting-point images: set by persistWorkingCopy's restore/snapshot logic when startWelcomeImages exceeded the budget (persistWorkingCopy.ts:386–388) and cleared by setStartWelcomeImages; names loss of a base-supplied asset, not an author edit. | — |
| historyEntryState | field | 578 | OVERLAY-CHANNEL | Patch channel `historyEntryState` (survey/types.ts:226). Writes via applyWorkingCopyPatch sink AND directly: lib/historyEntryState.ts threads proposal results into setHistoryEntryState and editors/adapters/flowStepOptions.tsx:515 calls it; rebuild install also writes it (rebuildWorkingCopy.ts:291–293). | — |
| chartPreference | field | 586 | EDITOR-AUTHORED | Written directly by components/DocumentationChecklist.tsx via setChartPreference; no decision record or patch channel. | — |
| docFixProposals | field | 596 | EDITOR-AUTHORED | Written directly by components/DocumentationFixProposals.tsx via setDocFixProposals; no decision record or patch channel. | — |
| touchKeyIdentity | field | 608 | EDITOR-AUTHORED | Contents are spec-104 decision-spine records, but no apply()/replay writes this slot: editors/assignLoop/TouchGallery.tsx (e.g. :3042, :3284, :3301) and components/TouchKeyIdentityList.tsx append/replace records directly via setTouchKeyIdentity. | — |
| startDocProfile | field | 615 | STARTING-POINT | Computed by the base browser for the focused base and recorded at selection: hooks/useStartDocProfile.ts and editors/panels/StartResolution.tsx call setStartDocProfile. Base-derived, pre-instantiation. | — |
| baselineDocFindings | field | 623 | STARTING-POINT | Computed once per instantiation from the base's own files (spec 079 FR-020): only production setter caller is hooks/useKeyboardArtifact.ts (:1134, :1186). | — |
| ir | field | 631 | DECISION-DERIVED | Seeded from startIr at instantiation, thereafter the decision-derived working IR: decision apply() `ir` channel via the sink's setWorkingIR (StudioShell.tsx:910, galleryHostDeps.ts:29) and replay install (rebuildWorkingCopy.ts:286). ALSO written directly by editor code via setWorkingIR/setIR (see those actions' caller counts) — dual-source, counted here once as DECISION-DERIVED because apply/replay is its defining source under spec 105's premise. | — |
| removalCapabilities | field | 638 | STARTING-POINT | Computed once at instantiation from the base IR (classifyRemovalCapabilities, passed into instantiate* opts); never recomputed on carve edits. Not snapshotted — re-derived from startIr on restore (persistWorkingCopy.ts:521–525). | — |
| deletedNodeIds | field | 643 | DECISION-DERIVED | Live writes are carve-gallery gestures, but the slice is reconstructed from the `carved-layout` decision alone by replay: decisions/carveOverlay.ts carveOverlayFromValue folds it and decisions/rebuildWorkingCopy.ts installRebuiltState installs it wholesale (setState, ~303–308). Live gesture action: deleteNode/restoreNode (carve gallery). | — |
| disabledFamilyIds | field | 652 | DECISION-DERIVED | Live writes are carve-gallery gestures, but the slice is reconstructed from the `carved-layout` decision alone by replay: decisions/carveOverlay.ts carveOverlayFromValue folds it and decisions/rebuildWorkingCopy.ts installRebuiltState installs it wholesale (setState, ~303–308). Live gesture action: toggleFamilyDisabled from components/rules/FamilyCardList.tsx; folds from the value's `family` removals. | — |
| deletedItemIds | field | 657 | DECISION-DERIVED | Live writes are carve-gallery gestures, but the slice is reconstructed from the `carved-layout` decision alone by replay: decisions/carveOverlay.ts carveOverlayFromValue folds it and decisions/rebuildWorkingCopy.ts installRebuiltState installs it wholesale (setState, ~303–308). Live gesture actions: deleteItem/cascadeDelete. | — |
| deletedTouchKeyIds | field | 669 | EDITOR-AUTHORED |  NOT in the carve fold: CarveOverlaySlice (decisions/carveOverlay.ts) has no deletedTouchKeyIds member and installRebuiltState never writes it. Live writers are TouchGallery gestures via deleteTouchKey/restoreTouchKey and commitTouchKeyRename's address remap (store impl). | — |
| carveChars | field | 682 | DECISION-DERIVED | Live writes are carve-gallery gestures, but the slice is reconstructed from the `carved-layout` decision alone by replay: decisions/carveOverlay.ts carveOverlayFromValue folds it and decisions/rebuildWorkingCopy.ts installRebuiltState installs it wholesale (setState, ~303–308). Live gesture action: cascadeDelete (NFC-normalized). | — |
| undoStack | field | 687 | EPHEMERAL | Session undo history for carve/key-edit gestures; rebuild install explicitly leaves it: 'undoStack is session state, not decision state' (rebuildWorkingCopy.ts, installRebuiltState comment). Not author truth — but note it IS captured by snapshotWorkingCopyData (persistWorkingCopy.ts:411), so 'ephemeral' here means not-author-truth, not unpersisted. | — |
| closedKeyboardCard | field | 709 | DECISION-DERIVED | Only non-null production writer found is the replay carve fold install (rebuildWorkingCopy.ts:308, from the value's closedKeyboardCard, carveOverlay.ts:77–80); its own setter setClosedKeyboardCard has 0 production callers and the card UI is not yet wired (interface doc, workingCopyStore.ts:709ff). Extraction reads it back into the carved-layout value (survey/carve/carveValue.ts:95,108). | — |
| carveDispositions | field | 726 | DECISION-DERIVED | Live writes are carve-gallery gestures, but the slice is reconstructed from the `carved-layout` decision alone by replay: decisions/carveOverlay.ts carveOverlayFromValue folds it and decisions/rebuildWorkingCopy.ts installRebuiltState installs it wholesale (setState, ~303–308). Live writes: prefillCarveDispositions (CarveGalleryV2 effect, lib/irToCarveNodes.ts) and restore-action pruning; setCarveDisposition itself has 0 production callers. | — |
| carveTouchKeepInert | field | 736 | UNCLASSIFIED | No live writer identified: setCarveTouchKeepInert has 0 production callers (test-only, workingCopyStore.carveDispositions.test.ts:271ff); the carved-layout value carries no field for it ('carveTouchKeepInert has no value field (D-090-31)', rebuildWorkingCopy.ts install comment; decisions/carveOverlay.ts header), so replay cannot reconstruct it; it is only cleared (keepAll/setIR) and restored from snapshot. Do not guess a source. | — |
| setCarveTouchKeepInert | action | 739 | UNCLASSIFIED | Setter for carveTouchKeepInert — see that field: 0 production callers, test-only. | 0 files |
| phaseResults | field | 743 | SURVEY-SLOT | Survey-results slot: written by recordPhase/recordAssignments (StepHost completion path and step components); answers themselves are stripped to [] since spec 090 T063 (store impl recordPhase) — the slot keeps non-answer result fields only. | — |
| irAxes | field | 748 | SURVEY-SLOT | Survey baseline slot: written by recordPhase's remerge, setIrAxes, syncRemapPostureFromIdentity, and seeded from the base IR at instantiation (seedIrAxesFromStartIr, detectMarkInputOrderFromImport). | — |
| session | field | 750 | SURVEY-SLOT | Derived within the survey slot: mergePhaseResults(irAxes, phaseResults) in remerge (store impl). Not snapshotted — re-derived on restore (persistWorkingCopy.ts:526). | — |
| desktopLocked | field | 752 | SURVEY-SLOT | Survey-flow lock slot: lib/assignLoopCompletion.ts applyPhysicalCompletionEffects calls lockDesktop() at mechanisms completion — its header states this is explicitly NOT decision apply work (089's patch has no channel for it). Also unlockDesktop from MechanismGallery. | — |
| sequenceFlaggedChars | field | 762 | SURVEY-SLOT | Survey slot (retired Sequence Gallery): flagCharForSequence has no current UI call site (store impl comment); unflagCharForSequence is still used by MechanismGallery's sequence-remove controls and strips Phase C sequence assignments via recordAssignments. | — |
| touchLayoutJson | field | 771 | SURVEY-SLOT | Phase E completion slot: built by lib/assignLoopCompletion.ts (buildTouchLayoutJsonForStep) at touch-step completion — explicitly a completion effect, not a decision apply (same header as desktopLocked); also set directly by TouchGallery via setTouchLayoutJson. | — |
| touchDraft | field | 791 | EDITOR-AUTHORED | In-progress Phase E editor draft, written directly by editors/assignLoop/TouchGallery.tsx on charTouch/suggestionResolved changes via setTouchDraft (also survey/touchSeedSource/TouchSeedSourcePanel.tsx and StudioShell); no decision source — the recorded touch decision lives in the decision store, this is its uncommitted working state. | — |
| galleryIntrosSeen | field | 811 | EPHEMERAL | One-time UI splash dismissal flags for this working-copy session (interface doc, workingCopyStore.ts:811); written by markGalleryIntroSeen from the two galleries. Not author truth (snapshot does round-trip it, persistWorkingCopy.ts:418). | — |
| keyEditOverlay | field | 822 | EDITOR-AUTHORED | Ordered op log written directly by key-grid editors via commitKeyEdit (7 production files, all editors/assignLoop). Replay does NOT reconstruct it: installRebuiltState leaves edit overlays untouched ('the edit overlays are separate layers, not part of the fold', rebuildWorkingCopy.ts). | — |
| deadkeyOverlay | field | 834 | EDITOR-AUTHORED | Ordered op log written directly by deadkey editors via commitDeadkeyOp (editors/deadkey/*, lib/deadkeyOps.ts); sibling of a setWorkingIR commit, not a decision apply (interface doc, workingCopyStore.ts:1195ff). Not folded by replay. | — |
| touchEditorMode | field | 844 | EPHEMERAL | Touch step view toggle ('A view toggle, not a fork', workingCopyStore.ts:844ff); written by setTouchEditorMode from TouchGallery. UI state, not author truth (snapshot carries it as an optional tolerant-read key). | — |
| staleSteps | field | 852 | EPHEMERAL | Derived UI state: transitive closure computed by markStale/clearStale from _reopenedRoots + the bound manifest (computeStalenessFromManifest). Interface doc says 'not persisted' — but snapshotWorkingCopyData does capture it (persistWorkingCopy.ts:419); see §2 note. | — |
| validatorFindings | field | 865 | EPHEMERAL | Derived UI state: published by the single useValidator cycle via setValidatorFindings (sole production caller StudioShell.tsx). Interface doc says 'not persisted' — but snapshotWorkingCopyData does capture it (persistWorkingCopy.ts:420); see §2 note. | — |
| keyIdentityDecisions | field | 877 | EDITOR-AUTHORED | Legacy spec-104 slice beside touchKeyIdentity: appended directly by editors/assignLoop/TouchGallery.tsx via recordKeyIdentityDecision (its only production caller). No apply()/replay writes it; the replay-folded record set is touchKeyIdentity, not this slice. | — |
| keyTransplants | field | 883 | UNCLASSIFIED | No live writer identified: its only writing action, recordTransplant, has 0 callers anywhere in the repo (rg over packages/, tests included — only the interface :1438, the WorkingCopyData Omit list :1752, and the impl :2720 mention it). Live transplant records go into touchKeyIdentity.transplantRecords via setTouchKeyIdentity (TouchGallery.tsx:3040–3042). This slice is only cleared by instantiate*/reset and restored from snapshot. Do not guess a source. | — |
| guardSpecification | field | 889 | UNCLASSIFIED | No live writer identified: setGuardSpecification has 0 callers anywhere in the repo (rg over packages/, tests included — only interface :1440, Omit list :1753, impl :2723). The live guard specification is carried in the marks-treatment decision value (survey/marks/guardSpecification.ts:180 records it there) and in touchKeyIdentity.guardSpecifications. This slice is only cleared by instantiate*/reset and restored from snapshot. Do not guess a source. | — |
| contextTolerance | field | 893 | EPHEMERAL | Derived analysis state, recomputed after every preview compile (hooks/useKeyboardArtifact.ts calls setContextTolerance, ~618–648). The one field the snapshot type explicitly drops as 'Recomputed after every preview compile; never stored' (persistWorkingCopy.ts:130). | — |
| contextToleranceOverlay | field | 895 | EDITOR-AUTHORED | Applied context-tolerance fix, written by hooks/useContextToleranceApply.ts via setContextToleranceOverlay when the author accepts a fix; decisions/rebuildWorkingCopy.ts only CLEARS it (starting-point supersession, ~408ff). No patch channel and no replay fold installs it. | — |
| contextNormalizationStep | field | 901 | EPHEMERAL | Generated cache of the normalization step, keyed by source content + generator version (interface doc, workingCopyStore.ts:901ff): written by hooks/useKeyboardArtifact.ts and lib/normalizationStepCache.ts. Not author truth — a cache that may be dropped over its persist budget and regenerated (persistWorkingCopy.ts serializeNormalizationStep). | — |
| axisFills | field | 920 | EPHEMERAL | UI-visibility provenance only: 'This is a UI-visibility field only — it is NOT re-derived by remerge()/mergePhaseResults()' (interface doc, workingCopyStore.ts:920ff). Published by MechanismGallery's defaultFillAxes pre-fill via setAxisFills. Not author truth (snapshot does round-trip it, persistWorkingCopy.ts:421). | — |
| setIR | action | 934 | DECISION-DERIVED | Wholesale write of ir (+ clears carve overlay/disabledFamilyIds/undoStack, resets guard-intent store). The apply/replay path uses setWorkingIR, not setIR; setIR's production references are editor/loader surfaces (deadkeyWrite, TouchGallery, useKeyboardArtifact). | 6 files (editors 2, hooks 1, stores 1, steps 1, (root) 1) |
| setWorkingIR | action | 947 | DECISION-DERIVED | THE decision write seam for ir: the patch sink's ir channel (StudioShell.tsx:910, galleryHostDeps.ts:29) and replay install (rebuildWorkingCopy.ts:286) both write through it; also used directly by editor code (deadkey, rules components, galleries). | 17 files (editors 5, lib 3, components 3, steps 2, survey 1, hooks 1, decisions 1, (root) 1) |
| clearIR | action | 949 | DECISION-DERIVED | Clears ir + carve deletion state; sole production reference hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| deleteNode | action | 951 | DECISION-DERIVED | Carve gesture writing deletedNodeIds (DECISION-DERIVED field); production references: decisions/createStudioDecisionRecorder.ts (recording wrapper) and lib/e2eHook.ts. | 2 files (lib 1, decisions 1) |
| toggleFamilyDisabled | action | 956 | DECISION-DERIVED | Writes disabledFamilyIds; sole production caller components/rules/FamilyCardList.tsx ('Disable group' toggle). | 1 files (components 1) |
| undoDelete | action | 958 | EPHEMERAL | Pops undoStack (EPHEMERAL field) and reverses the corresponding deletion/key-edit; sole production caller TouchGallery. | 1 files (editors 1) |
| restoreNode | action | 960 | DECISION-DERIVED | Restores deletedNodeIds entries + prunes carveDispositions; 0 production callers (test-only). | 0 files |
| isDeleted | action | 962 | DECISION-DERIVED | Read of deletedNodeIds; 0 production callers (test-only). | 0 files |
| deleteItem | action | 964 | DECISION-DERIVED | Carve gesture writing deletedItemIds; 0 production callers (test-only) — live carve deletes route through cascadeDelete. | 0 files |
| restoreItem | action | 966 | DECISION-DERIVED | Restores deletedItemIds entries + prunes carveDispositions; 0 production callers (test-only). | 0 files |
| isItemDeleted | action | 968 | DECISION-DERIVED | Read of deletedItemIds; callers are the carve/touch/mechanism galleries. | 3 files (editors 3) |
| deleteTouchKey | action | 974 | EDITOR-AUTHORED | Writes deletedTouchKeyIds (EDITOR-AUTHORED field); callers TouchGallery and survey/questions/gallery/touchLayout.ts (module doc comment names it a live write path). | 2 files (survey 1, editors 1) |
| restoreTouchKey | action | 976 | EDITOR-AUTHORED | Restores deletedTouchKeyIds entries; caller TouchGallery (also used internally by commitTouchKeyRename). | 1 files (editors 1) |
| isTouchKeyDeleted | action | 978 | EDITOR-AUTHORED | Read of deletedTouchKeyIds; caller TouchGallery. | 1 files (editors 1) |
| keepAll | action | 989 | DECISION-DERIVED | Bulk-clear of the carve overlay (deletedNodeIds/deletedItemIds/deletedTouchKeyIds/carveChars/carveDispositions) — also clears keyEditOverlay/deadkeyOverlay/undoStack; callers CarveGalleryV2, steps/editorMutate.ts, survey/carve/carveValue.ts. | 3 files (steps 1, survey 1, editors 1) |
| restoreAll | action | 991 | DECISION-DERIVED | Alias delegating to keepAll (store impl); callers StatusBar, CarveGalleryV2, editorMutate, carveValue. | 4 files (editors 2, steps 1, survey 1) |
| cascadeDelete | action | 1012 | DECISION-DERIVED | Grouped carve cascade writing deletedItemIds + carveChars + one batch undo entry; callers CarveGalleryV2, MechanismGallery, lib/irToCarveNodes.ts, lib/irToCharacterView.ts, lib/e2eHook.ts, carveValue. | 6 files (lib 3, editors 2, survey 1) |
| cascadeRestore | action | 1021 | DECISION-DERIVED | Inverse of cascadeDelete; callers CarveGalleryV2, lib/irToCharacterView.ts. | 2 files (lib 1, editors 1) |
| setClosedKeyboardCard | action | 1030 | DECISION-DERIVED | Setter for closedKeyboardCard (DECISION-DERIVED field); 0 production callers — the card UI is not yet wired (see field note). | 0 files |
| prefillCarveDispositions | action | 1051 | DECISION-DERIVED | Pre-fills carveDispositions from the bulk default (never overwrites); callers CarveGalleryV2 effect and lib/irToCarveNodes.ts. | 2 files (lib 1, editors 1) |
| setCarveDisposition | action | 1066 | DECISION-DERIVED | Per-row author override of carveDispositions (provenance author-override); 0 production callers (test-only). | 0 files |
| pruneCarveDispositions | action | 1078 | DECISION-DERIVED | Compile-path sweep of carveDispositions; 0 production callers (test-only). | 0 files |
| getCarveDispositions | action | 1087 | DECISION-DERIVED | Compiler read path for carveDispositions; callers lib/projectWorkingCopyVfs.ts, hooks/useWorkingCopyTransform.ts. | 2 files (lib 1, hooks 1) |
| recordPhase | action | 1116 | SURVEY-SLOT | Writes phaseResults + re-derived session via remerge; the StepHost completion path (components/StepHost.tsx) and step components call it. | 14 files (survey 8, steps 2, editors 2, decisions 1, components 1) |
| recordAssignments | action | 1122 | SURVEY-SLOT | Phase C assignments into phaseResults; callers MechanismGallery, SequenceBuilderPanel, physical-layout module/renderer, createStudioDecisionRecorder. | 6 files (survey 3, editors 2, decisions 1) |
| setIrAxes | action | 1124 | SURVEY-SLOT | Writes irAxes + re-derived session; 0 production callers (test-only) — live irAxes writes arrive via recordPhase/remerge, instantiate seeding, and syncRemapPostureFromIdentity. | 0 files |
| syncRemapPostureFromIdentity | action | 1132 | SURVEY-SLOT | Reconciles irAxes.remapPosture (A7a derivation) against startIr; sole production caller survey/CharactersStep.tsx. | 1 files (survey 1) |
| lockDesktop | action | 1137 | SURVEY-SLOT | Sets desktopLocked; production references include lib/assignLoopCompletion.ts (mechanisms completion effect) and the assign-loop adapters/galleries. | 10 files (editors 4, steps 2, lib 2, survey 1, dashboard 1) |
| unlockDesktop | action | 1139 | SURVEY-SLOT | Clears desktopLocked; sole production caller MechanismGallery. | 1 files (editors 1) |
| setTouchLayoutJson | action | 1147 | SURVEY-SLOT | Writes touchLayoutJson; callers lib/assignLoopCompletion.ts (Phase E completion build), TouchGallery, steps/reducer.ts (reference). | 3 files (editors 1, steps 1, lib 1) |
| setTouchDraft | action | 1153 | EDITOR-AUTHORED | Writes touchDraft (EDITOR-AUTHORED field); callers TouchGallery, TouchSeedSourcePanel, touchLayout gallery module, StudioShell. | 4 files (survey 2, editors 1, (root) 1) |
| markGalleryIntroSeen | action | 1161 | EPHEMERAL | Writes galleryIntrosSeen; callers TouchGallery, MechanismGallery. | 2 files (editors 2) |
| commitKeyEdit | action | 1171 | EDITOR-AUTHORED | Appends to keyEditOverlay + a 'k' undo entry; all 7 production files are editors/assignLoop (keyGrid/* + TouchGallery). | 7 files (editors 7) |
| undoKeyEdit | action | 1182 | EDITOR-AUTHORED | Pops keyEditOverlay tail + its 'k' undo entry; sole production caller TouchGallery. | 1 files (editors 1) |
| commitDeadkeyOp | action | 1195 | EDITOR-AUTHORED | Appends to deadkeyOverlay; callers editors/deadkey/* and lib/deadkeyOps.ts. | 4 files (editors 3, lib 1) |
| commitTouchKeyRename | action | 1225 | EDITOR-AUTHORED | Editor rename fix-up: engine renameTouchKey over ir, hand-set promotion, writes via setWorkingIR, remaps deletedTouchKeyIds; callers keyGrid/RenameDialog.tsx, TouchGallery. | 2 files (editors 2) |
| setTouchEditorMode | action | 1233 | EPHEMERAL | View toggle for touchEditorMode; sole production caller TouchGallery. | 1 files (editors 1) |
| flagCharForSequence | action | 1238 | SURVEY-SLOT | Adds to sequenceFlaggedChars; its only production reference is lib/confirmRebase.ts and the store impl states no current UI call site populates the list. | 1 files (lib 1) |
| unflagCharForSequence | action | 1243 | SURVEY-SLOT | Removes from sequenceFlaggedChars + strips Phase C sequence assignments via recordAssignments; callers MechanismGallery, SequenceBuilderPanel, patternIds. | 3 files (editors 3) |
| reset | action | 1249 | EPHEMERAL | Lifecycle action: restores INITIAL_STATE across every slot and clears _reopenedRoots; writes no author truth of its own. Caller count is NOT meaningful for this name — see method note. | 52 files reference the word `reset` — generic name, mostly other stores' own reset() methods; not a verified caller count for this action |
| instantiateFromStart | action | 1270 | STARTING-POINT | Track-1 instantiation: sets the starting-point slots, seeds ir from startIr, resets identity to the seed, clears edit layers (store impl). | 9 files (lib 4, hooks 2, steps 1, decisions 1, (root) 1) |
| instantiateFromExisting | action | 1300 | STARTING-POINT | Track-2 instantiation: sets the starting-point slots, preserves identity from the loaded keyboard (store impl). | 5 files (lib 2, hooks 1, (root) 1, steps 1) |
| setIdentity | action | 1324 | OVERLAY-CHANNEL | Whole-value write of the identity overlay channel; called by the patch sink (StudioShell, galleryHostDeps), rebuild install, and directly by TrackOneIdentityPanel / CompareScreen. | 5 files (lib 1, editors 1, decisions 1, components 1, (root) 1) |
| setAttribution | action | 1329 | OVERLAY-CHANNEL | Whole-value write of the attribution overlay channel; production callers are only the two sink compositions and rebuild install. | 4 files (lib 1, survey 1, decisions 1, (root) 1) |
| setLicenseUnparseable | action | 1332 | STARTING-POINT | Writes licenseUnparseable; sole production caller hooks/useKeyboardArtifact.ts (base load). | 1 files (hooks 1) |
| setStartHolderOverride | action | 1335 | EDITOR-AUTHORED | Writes startHolderOverride; sole production caller hooks/usePreviewArtifact.ts (author-typed download-unblock UI). | 1 files (hooks 1) |
| setStartLicenseText | action | 1338 | STARTING-POINT | Writes startLicenseText; sole production caller hooks/useKeyboardArtifact.ts (base load). | 1 files (hooks 1) |
| setHelpDocs | action | 1345 | OVERLAY-CHANNEL | Whole-value write of the helpDocs overlay channel; production callers are only the two sink compositions and rebuild install. | 3 files (decisions 1, (root) 1, lib 1) |
| setStartWelcomeHtmText | action | 1348 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setStartHelpPhpText | action | 1351 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setBaseHelpPhpTextForExtraction | action | 1352 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setStartReadmeMdText | action | 1355 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setStartHistoryMdText | action | 1358 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setStartDocCssTexts | action | 1361 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setStartWelcomeImages | action | 1364 | STARTING-POINT | Base-load setter (also clears startWelcomeImagesDropped); sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setStartWelcomeConvention | action | 1367 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setHistoryEntryState | action | 1370 | OVERLAY-CHANNEL | Whole-value write of the historyEntryState overlay channel; called by the patch sink, rebuild install, lib/historyEntryState.ts, and flowStepOptions. | 5 files (lib 2, (root) 1, decisions 1, editors 1) |
| setChartPreference | action | 1373 | EDITOR-AUTHORED | Direct UI setter; sole production caller components/DocumentationChecklist.tsx. | 1 files (components 1) |
| setDocFixProposals | action | 1376 | EDITOR-AUTHORED | Direct UI setter; sole production caller components/DocumentationFixProposals.tsx. | 1 files (components 1) |
| setTouchKeyIdentity | action | 1379 | EDITOR-AUTHORED | Direct editor setter for the spec-104 record set; callers TouchGallery, components/TouchKeyIdentityList.tsx. | 2 files (components 1, editors 1) |
| setStartDocProfile | action | 1382 | STARTING-POINT | Selection-time setter; callers hooks/useStartDocProfile.ts, editors/panels/StartResolution.tsx. | 2 files (hooks 1, editors 1) |
| setBaselineDocFindings | action | 1385 | STARTING-POINT | Base-load setter; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| isInstantiated | action | 1392 | STARTING-POINT | Read: startKeyboard !== null; callers draftPersistence, confirmRebase, usePreviewArtifact, OutputScreen. | 4 files (lib 2, hooks 1, components 1) |
| markStale | action | 1410 | EPHEMERAL | Recomputes staleSteps closure; callers MechanismGallery, dashboard/completeness.ts. | 2 files (editors 1, dashboard 1) |
| clearStale | action | 1421 | EPHEMERAL | Recomputes staleSteps closure; callers MechanismGallery, completeness, assignLoopCompletion, steps/reducer.ts (reference). | 4 files (editors 1, dashboard 1, steps 1, lib 1) |
| setValidatorFindings | action | 1433 | EPHEMERAL | Publishes validatorFindings; sole production caller StudioShell.tsx. | 1 files ((root) 1) |
| recordKeyIdentityDecision | action | 1436 | EDITOR-AUTHORED | Appends to keyIdentityDecisions; sole production caller TouchGallery. | 1 files (editors 1) |
| recordTransplant | action | 1438 | UNCLASSIFIED | Appends to keyTransplants — see that field: 0 callers anywhere in the repo. | 0 files |
| setGuardSpecification | action | 1440 | UNCLASSIFIED | Setter for guardSpecification — see that field: 0 callers anywhere in the repo. | 0 files |
| setContextTolerance | action | 1447 | EPHEMERAL | Publishes contextTolerance analysis state; sole production caller hooks/useKeyboardArtifact.ts. | 1 files (hooks 1) |
| setContextToleranceOverlay | action | 1450 | EDITOR-AUTHORED | Writes contextToleranceOverlay; callers hooks/useContextToleranceApply.ts and rebuildWorkingCopy (clear-on-supersession only). | 2 files (hooks 1, decisions 1) |
| setContextNormalizationStep | action | 1453 | EPHEMERAL | Writes the contextNormalizationStep cache; callers hooks/useKeyboardArtifact.ts, lib/normalizationStepCache.ts. | 2 files (lib 1, hooks 1) |
| setAxisFills | action | 1463 | EPHEMERAL | Publishes axisFills; callers MechanismGallery, dashboard/StrategyTreeView.tsx. | 2 files (editors 1, dashboard 1) |

## 2. Persistence capture map

There is exactly **one** enumeration of the working-copy fields for persistence: `snapshotWorkingCopyData()` in `packages/studio/src/lib/persistWorkingCopy.ts:346–446`. Both capture paths use it — there is no second list to drift:

- **OAuth/session snapshot**: `snapshotWorkingCopyToSession()` calls it at persistWorkingCopy.ts:645.
- **Draft envelope `workingCopy` slice**: `saveDraft()` in `packages/studio/src/lib/draftPersistence.ts:799` builds the envelope at :833ff with `workingCopy: snapshotWorkingCopyData()` at **draftPersistence.ts:840**. The cloud-sync snapshot builder in the same file does the same at **draftPersistence.ts:1717**. So the draft envelope's workingCopy slice captures exactly what `snapshotWorkingCopyData()` captures — nothing more, nothing less.

### Captured (53 of 56 fields)

`snapshotWorkingCopyData()` (persistWorkingCopy.ts, builder line in parentheses): instantiationMode (:350), startKeyboard (:351), startIr (:353), identity (:354), attribution (:358), licenseUnparseable (:362), startHolderOverride (:363), startLicenseText (:364), helpDocs (:367), startWelcomeHtmText (:368), startHelpPhpText (:369), baseHelpPhpTextForExtraction (:374), startReadmeMdText (:377), startHistoryMdText (:378), startDocCssTexts (:381), startWelcomeConvention (:382), startWelcomeImagesDropped (:386–388), historyEntryState (:390), chartPreference (:391), docFixProposals (:393), touchKeyIdentity (:397), startDocProfile (:398), baselineDocFindings (:399), ir (:400), deletedNodeIds (:401, Set→array), deletedItemIds (:402, Set→array), deletedTouchKeyIds (:403, Set→array), disabledFamilyIds (:404, Set→array), carveChars (:410, Set→array), undoStack (:411), phaseResults (:412), irAxes (:413), desktopLocked (:414), sequenceFlaggedChars (:415), touchLayoutJson (:416), touchDraft (:417), galleryIntrosSeen (:418), staleSteps (:419, Set→array), validatorFindings (:420), axisFills (:421), keyIdentityDecisions (:424), keyTransplants (:425), guardSpecification (:426), closedKeyboardCard (:431), carveDispositions (:432), carveTouchKeepInert (:435), keyEditOverlay (:440), deadkeyOverlay (:441), touchEditorMode (:442), contextToleranceOverlay (:443), contextNormalizationStep (:444, via serializeNormalizationStep).

Transformed / conditional captures:

- **startVfs** — captured only in transformed form as `startVfsEntries` (persistWorkingCopy.ts:352, `serializeStartVfsEntries(s.startVfs)`; Base64 for binary entries). The snapshot type renames it in the Omit/override at persistWorkingCopy.ts:112–145.
- **startWelcomeImages** — captured only conditionally: spread in at persistWorkingCopy.ts:383 *only when* `serializeWelcomeImages` returns a value; over the 2 MB budget (`BASE_WELCOME_IMAGES_BUDGET_BYTES`, persistWorkingCopy.ts:254) it is omitted and the omission is recorded in startWelcomeImagesDropped (:386–388).
- **contextNormalizationStep** — captured through `serializeNormalizationStep` (:444), which returns `null` when the slimmed step exceeds `NORMALIZATION_STEP_PERSIST_BUDGET_CHARS` (persistWorkingCopy.ts:262, applied at :274) — the cache is dropped, not the draft.

Also in the snapshot but **not** WorkingCopyState members (out of this census's denominator): `keptGuardRuleIds`, `dismissedMissingGroups`, `narrowedGuardQuestions` (persistWorkingCopy.ts:407–409), read from the separate guard-intent store.

### NOT captured anywhere (3 of 56 fields)

| Field | Line (interface) | Why not captured | Restore behaviour |
|---|---|---|---|
| removalCapabilities | 638 | Dropped from `WorkingCopySnapshot` by the Omit at persistWorkingCopy.ts:112–145; absent from the builder (:346–446) | Re-derived from the restored startIr via `classifyRemovalCapabilities(startIr)` in `prepareWorkingCopySnapshot` (persistWorkingCopy.ts:517), computed at persistWorkingCopy.ts:521–525 (empty Map when startIr is null) |
| session | 750 | Same Omit; absent from the builder | Re-derived via `mergePhaseResults(irAxes, phaseResults)` in `prepareWorkingCopySnapshot`, persistWorkingCopy.ts:526 |
| contextTolerance | 893 | Same Omit — the type comment states it outright: "Recomputed after every preview compile (spec 078); never stored" (persistWorkingCopy.ts:130) | Not restored; returns to `{status:"idle"}` and is recomputed by the next preview compile's analysis |

Discrepancy worth Phase 0's attention: the store's own interface docs describe `staleSteps` (workingCopyStore.ts:852) and `validatorFindings` (:865) as "Derived UI state — not persisted", and §1 classifies both EPHEMERAL on that basis — but the snapshot builder **does** capture both (persistWorkingCopy.ts:419, :420) and `prepareWorkingCopySnapshot` restores both (persistWorkingCopy.ts:591, :592). The docs and the capture map disagree; the capture map above follows the code.

## 3. The patch sink: `applyWorkingCopyPatch`

### The patch type and its channels

`WorkingCopyPatch` is defined in `packages/studio/src/survey/types.ts:216–227`. Five channels, each optional, each a whole-value replace:

| Channel | types.ts line | Lands on field | Via store action |
|---|---|---|---|
| `ir` | :218 | ir | checked merge (`applyMutatePatch`, steps/mutateApply.ts) then `setWorkingIR` |
| `identity` | :220 | identity | `setIdentity` |
| `attribution` | :222 | attribution | `setAttribution` |
| `helpDocs` | :224 | helpDocs | `setHelpDocs` |
| `historyEntryState` | :226 | historyEntryState | `setHistoryEntryState` |

There is **no** patch channel for any other field — in particular none for the carve overlay (the carve fold in replay is a separate mechanism, §1 notes), the key-edit/deadkey overlays, or any starting-point slice.

### Where the sink is defined

`applyWorkingCopyPatch` is not a store action. It is an **injected dependency**:

- Declared on `ReducerDeps` at `packages/studio/src/steps/reducer.ts:183` (`applyWorkingCopyPatch?: (patch: WorkingCopyPatch, writes: readonly IRPath[]) => void`), with the A4 contract comment at :174–183: the `ir` channel's checked merge runs *before* any overlay channel is written, so a containment failure applies nothing.
- **Composed in `packages/studio/src/StudioShell.tsx:905–915`**: if `patch.ir !== undefined && wc.ir !== null`, `wc.setWorkingIR(applyMutatePatch(wc.ir, patch.ir, writes))`; then, in order, `setIdentity` (:912), `setAttribution` (:913), `setHelpDocs` (:914), `setHistoryEntryState` (:915) for each defined channel.
- **Composed a second time, identically, in `packages/studio/src/lib/galleryHostDeps.ts:27–36`** (`buildGalleryHostDeps`), because steps/galleryHost.tsx may not import stores/. Two sink instances, same code shape — a drift risk Phase 0 should record.

### Who calls it

1. **The decision-apply path**: `applyDecisionEffects` in steps/reducer.ts — declared at :460, the sink is taken from deps at :464–465 and invoked per module `apply()` (after the A3 channel-authorization check in steps/applyAuthorization.ts) at the `sink(patch, writes)` call inside `runApply` (reducer.ts:485). Pass 1 runs per answered question; pass 2 runs composed applies whose `requires` inputs were recorded by the same completion.
2. **The gallery host** (the only other production caller): `runGalleryApply` in `packages/studio/src/steps/galleryHost.tsx:137–153` builds the ApplyContext, runs the module's `apply`, checks authorization, and calls `deps.applyWorkingCopyPatch(patch, writes)` at **galleryHost.tsx:152**, with deps composed by `buildGalleryHostDeps` (lib/galleryHostDeps.ts). `decideGalleryValue` (:156ff) is its onChange core: record the decision, then run the apply.
3. Test/test-harness compositions only (excluded from production counts): steps/applyDecisionEffects.test.ts:52, steps/applyDecisionEffects.attributionCompletion.test.tsx:71, steps/galleryHost.test.tsx:48, src/test/sc004Harness.ts:188, src/t028GateHarness.test.tsx:238.

### Who bypasses it

- **Replay** does not call the sink at all: `replayKeyboard`'s `foldPatch` (decisions/replayKeyboard.ts:101–118) folds the same five channels into a `ReplayState` (the four overlay channels into `OverlayState`, replayKeyboard.ts:58), and `installRebuiltState` (decisions/rebuildWorkingCopy.ts:284–308) installs the result through the same four setters plus `setWorkingIR` — a third composition of the same channel order.
- **Direct setter writes** to overlay-channel fields, bypassing the patch entirely: identity — editors/panels/TrackOneIdentityPanel.tsx:107,122 and instantiate* seeding/preservation; historyEntryState — lib/historyEntryState.ts and editors/adapters/flowStepOptions.tsx:515. For attribution and helpDocs, no direct production writer was found: every production write arrives via one of the two sink compositions or rebuild install (rg evidence in §1).
