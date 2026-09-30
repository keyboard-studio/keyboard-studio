# Spec 063 gap review — cycle 1 (KM crew, 2026-08-03)

**Scope reviewed:** [spec.md](../spec.md), [research.md](../research.md), [contracts/touch-key-rule-join.md](../contracts/touch-key-rule-join.md), [contracts/key-id-policy.md](../contracts/key-id-policy.md), at draft/specify stage.

**Crew:** km-keyman, km-domain, km-frontend, km-validator, km-output, km-author, km-synthesis, km-testing — all eight verdicts: **APPROVE WITH GAPS**.

**Lead decision: CONDITIONAL** — the spec's core design (the join, role classification, id-minting policy, view-toggle model) is sound and code-verified, but the P0 items below must be resolved in the spec/contracts before `/speckit-plan` closes.

---

## P0 — resolve before /speckit-plan closes

### P0-1. Case A re-derivation can silently evaporate a key-edit session *(km-output)*
`buildTouchLayoutJson`'s Case A path re-runs `scaffoldTouchLayoutWithDiagnostics` fresh from `baseIr` on every cycle; `touchKeyAddress` misses resolve **silently** (by design, for the deletion overlay where a miss is harmless). An address-keyed key-edit op recorded against one scaffold pass silently no-ops after any upstream desktop edit reachable via Back. No FR or Assumption addresses it. **Fix:** specify one of — detect-and-warn, freeze the Case A seed once by-key edits exist, or content-based re-addressing.

### P0-2. Overlay data structure: address-keyed map contradicts the ordered-log semantics the spec itself needs *(km-output)*
Key Entities calls the overlay "an address-keyed map"; FR-032 (one undo entry per edit) and §6.2's shared resolver require an **ordered op-log** replayed against evolving state — a literal `Map<address, edit>` cannot express rename-then-add coherently. **Fix:** state explicitly that the overlay is an ordered list of operations.

### P0-3. Key-edit overlay has no persistence story *(km-frontend; corroborated km-synthesis, km-output)*
`persistWorkingCopy.ts`'s `PersistedFields` enumerates what survives autosave/cloud-sync (`deletedTouchKeyIds`, `undoStack`, `touchDraft`, …); the new overlay is absent and no FR adds it. FR-036b's "no state discarded" is false on reload without it. **Fix:** add an FR making the overlay part of the persisted working-copy shape (incl. `DurableDraft` versioning).

### P0-4. Opaque-fragment carve-out missing on the mutation-blocking path *(km-keyman)*
The dead-key *finding* downgrades to a hint when `opaqueFragmentCount > 0` (join §5.1), but key-id-policy §3's hard block ("`T_` with no rule — blocked") and §6.1 idempotence have no equivalent: a rule hidden in a `RawKmnFragment` makes the join read zero bindings, the studio force-synthesizes a rule, and the emitted `.kmn` carries two competing rules — contradicting FR-027 and SC-008. **Fix:** when any opaque fragment is present, warn-and-confirm instead of auto-synthesizing.

### P0-5. FR-007's caller-migration list is incomplete *(km-synthesis)*
`TouchGallery.tsx` (~L1964) calls `computeTouchCoverage` **directly** from contracts to build `baseTouchCoveredSet` (feeding `collectCompositionMethod`) — a live fourth call site beyond the three the contract names (engine wrapper, Layer C, inventory gate). Leaving it unjoined is exactly the failure §3.2 warns against. **Fix:** add it to the §3.2 migration list.

### P0-6. FR-031 contradicts the existing promotion helper *(km-synthesis)*
`promoteKeyToHandSet`/`promoteOnManualEdit` ([touchBehavior.ts](../../../packages/studio/src/editors/assignLoop/touchBehavior.ts):120–154) is **id-matched** across all platforms/layers and is live at `TouchGallery.tsx:2955`; FR-031 mandates **address-matched** promotion but never names this helper. **Fix:** specify whether the helper's semantics change (risking the case-pair-companion flow) or a second address-matched path is added beside it.

### P0-7. Layer C error-severity is a layer-boundary breach *(km-validator)*
Every shipped Layer C check is warning-only (grep: zero `error` severities in `keyboard-lint`). Join §5 introduces `KM_ERROR_TOUCH_KEY_ID_INVALID` at `error` — but "id the compiler rejects" is a Layer A concern; the existing precedent for import-time validity is **Layer A′** (`engine/src/validator/layer-a-prime.ts`). **Fix:** route the invalid-id check through Layer A′ (or record an explicit sign-off for Layer C's first error).

### P0-8. FR-063–068 (layer families) have zero test obligations *(km-testing)*
Neither contract covers the plane/modifier decomposition, the freeform-plane fallback (`gff_amharic`'s 53 Ethiopic layer names), or FR-068's property-scoped frame-key exemption. Largest untested-by-spec surface in the feature. **Fix:** add a Test obligations subsection (decomposition on real corpus layer-id strings; per-property exemption; freeform-fallback silence guarantee).

---

## P1 — significant; fold into the spec before or during /speckit-plan

**Join & producibility semantics** *(km-keyman)*
- **"Reachable" ≠ compiler-reachable.** Reachability only checks touch-layer BFS, not whether the rule's group is reachable via `use()` from the entry group. State the scope limit in §4.3.
- **No layer↔modifier cross-check.** A `T_X` carried only on `default` whose sole rule requires `[SHIFT T_X]` is over-credited. Add the consistency check or scope it out explicitly.
- **`U_`-with-rule ≠ redundant.** A rule on a `U_` id overrides the self-output; only call it redundant when the produced text equals the decoded codepoint — otherwise report "override."
- **`TouchKeyIR.layer` must feed the "Sends:" display.** R3's mockup derives "Sends:" from the containing layer only; when `key.layer` is present it must supersede — the field exists for exactly those 11,593 keys.

**Upstream fidelity** *(km-author)*
- **`U_` regex stricter than upstream.** Upstream validates each `_`-segment's *semantic range* (`[0x20,0x7F] ∪ [0xA0,0x10FFFF]`), no digit-count shape; `U_41` is upstream-legal but studio-rejected. Validate range for imported ids; keep 4–6-digit padding for minting only.
- **Subkey `default` (longpress preselect) is a real wire field, unmodeled in the IR** — the same silent-drop defect class as `layer` (writer special-cases it; `parseTouchLayout` has zero hits). Audit it in R4 and decide whether it joins the §18 change or is round-tripped via raw preservation.
- `T_*_MT_SHIFT_TO_*` ids are syntactically **valid** under both regexes (the `*` is non-whitespace); collision-rejection needs an exact-match special case, not regex exclusion.
- 0x0A9 is target-version-gated upstream (pre-14 label transform); spec doesn't say whether the studio tracks a minimum Keyman version.

**Linguistic breadth** *(km-domain)*
- **RTL/bidi never addressed** (also km-frontend): grid mirroring, Home/End edges, find-by-value reading order — per-layer script direction.
- **Layer-family protection is nil for non-Latin layer naming** — the Ethiopic/syllabary keyboards cited as motivation get zero parallelism protection by design (FR-067 fails silent). Acknowledge, or sketch increment-2 coverage.
- **Canonical mark ordering (CCC)** across sequential `T_`-key strokes is unaddressed — synthesized mark rules can build non-NFC sequences invisible until compared against an NFC inventory.
- **Fresh guard-store content unspecified** — a Cameroon-style ASCII literal fails non-Latin punctuation/digit repertoires; derive the minted set from the keyboard's own exemplar data.

**Validator wiring** *(km-validator)*
- **FR-043's "148-row length-tested" rationale is stale** — `schemas.test.ts`/`types.test.ts` deliberately do *not* assert cardinality. Verify the actual constraint before citing it.
- **Sibling-code table strains `lintRuleId: string` (1:1)** — three new codes hung off 18.4, whose description ("control keys do not move or resize") doesn't cover id uniqueness/validity/required keys.
- **D3 wiring unspecified:** `useValidator` is keyed on `kmnSource: string` and feeds the single findings field; the new diagnostics need parsed IR + touch layout — a different input shape. State how they merge into the one feed.
- **Live vs Layer-C dedup:** no statement whether edit-time and phase-exit checks share one implementation.

**Studio/UI** *(km-frontend)*
- **aria-live:** codebase already has multiple regions (TouchGallery ×2, DiagnosticsPanel); "one region" needs a stated consolidation decision.
- **Virtualization:** corpus layouts reach 2,256 keys / 47 layers; FR-020a bounds Tab stops, not DOM nodes. Specify a windowing strategy for grid and layers rail.
- **Focus management after destructive edits** (delete/suppress/row-removal) unspecified.
- **Mode-toggle ownership + ARIA role** (tabs vs radiogroup) unspecified; no existing segmented control to reuse; state home (`galleryIntrosSeen` precedent per km-synthesis).
- **FR-036c plural carry:** a character can map to several keys; single-selection inspector needs a stated disambiguation (highlight-all vs pick-first).
- **FR-038 fix locus:** "apply physical assignments" could mean IR mutation (baseKeyboard already carries the rule) or extending `vfsTransform` — different single-writer implications; pick one.

**Output/emit** *(km-output)*
- **FR-033's "slot" is ambiguous between passes 1.5 (`applyCarveKeycapRemovalsToVfs`) and 1.6 (`applyTouchKeycapRemovalsToVfs`)** in `projectWorkingCopyVfs.ts`; rename-vs-1.6 ordering also affects `deletedTouchKeyIds` staleness. Pin a step number and ordering rule.
- **SC-006 "byte-identical" oversells:** the raw-JSON pass does whole-file `JSON.parse`→`stringify` once any key changes, collapsing shipped formatting. The contract's own test is structural-modulo. Reword SC-006 to structural equivalence or specify format-preserving patching.
- Deletion-overlay remap on rename: reuse `deleteTouchKey`/`restoreTouchKey` actions (undo-consistent) or mutate the Set directly — specify (km-synthesis).

**Synthesis conventions** *(km-synthesis)*
- Guard naming split: `mark-guards.ts` uses nodeIds `gen-marks-*` but store/group names `generated_marks_*`; FR-026/§6.1's stated convention matches neither exactly. Cite the file and name the touch scheme (e.g. `gen-touch-*`).

**Testing** *(km-testing)*
- SC-004 "under two minutes" → reword to a step-count/no-dead-end assertion.
- SC-009 → cite the existing `expectNoSeriousAxeViolations` helper (`e2e/helpers/axe.ts`, spec 056 FR-003).
- Corpus-wide calibration figures need one sentence: narrative-only, never test-asserted; only the two Cameroon canaries are pinned (both verified accurate against `../keyboards`).
- Mode-toggle (FR-036a–g) needs stated test obligations (toggle-toggle-toggle state preservation, cross-mode undo).
- `TouchKeyIR.layer` needs its own parse→emit round-trip obligation plus a duplicate-id-disambiguated-by-layer fixture.
- SC-010 needs a named enforcement mechanism: fake-timer behavioral spec or a static timer-grep lint; neither exists today.
- `window.__ksE2E__` lacks grid/overlay/undo accessors; US2–US5 E2E needs the hook extended.

---

## P2 (abridged)

`context(2+)` classified opaque not guard (harmless, note it); `K_` case-insensitivity attribution imprecise + `&mnemoniclayout` footnote; title-case digraphs (Lt) fail safe but undocumented in case-triplication; multi-codepoint grapheme clusters (Indic conjuncts) deserve a named acceptance scenario; i18n ids for proposed-rule prose; Continue with both drafts dirty; `TouchKeyIR.layer` decline-fallback covers lint but not the grid UI; opaque-downgrade granularity vs the 18.6 whole-check-skip precedent; applier-twin test fixture unnamed (reuse the §8 Cameroon-derived inline fixture).

---

## What was verified clean

- The two "verified defects" (sp enum `{9,10}`, dropped `layer` field) are real — confirmed against upstream `keyman-touch-layout-file.ts` and repo code.
- The upstream warning-code citations (0x091/092/093/099/0A9/05A), sp semantics, `layer` vs `nextlayer`, `forUnicodeKeynames` self-output analysis: accurate.
- `buildProducedSet` adopter table (§4.4) complete against the actual caller set; `useInventoryDiff` shape claim accurate; `comboToTouchLayerId` forward-only claim accurate; `collectFromElements` is exported as FR-004 assumes.
- Cameroon canaries: `sil_cameroon_qwerty` has exactly 14 dotted-circle `T_*` keys; `sil_cameroon_azerty` carries the orphan `T_03B1` — both as the spec describes.

## Recommended next steps

1. Resolve P0-1..P0-8 as spec/contract edits (most are a paragraph each; P0-1 needs a real design decision).
2. Fold the P1 items into spec.md/contracts during the same editing pass; add the two missing Test-obligations subsections (layer families, mode toggle) and fix SC-004/006/009/010 wording.
3. Add the `NEEDS CLARIFICATION` follow-up for the subkey `default` field to the §18 sign-off item (same change as `TouchKeyIR.layer` or explicitly deferred).
4. Then proceed to `/speckit-plan`; a targeted re-review (km-keyman + km-output + km-validator) on the edited contracts is cheaper than a full cycle-2.
