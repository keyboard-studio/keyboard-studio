# Phase 0 Research: Text-sample prefill (paste or upload)

All unknowns resolved against the live tree (2026-08-19). No `NEEDS CLARIFICATION` remain. This research supersedes the spec's own original Context section — see the spec.md "Ground-truth correction" callouts for the narrative; this file records the resulting implementation decisions.

## R1 — The real target is `TextSamplePlaceholder`, not the older `pb_text_sample` chain

**Decision**: Build against `packages/studio/src/survey/PhaseB.tsx`'s `TextSamplePlaceholder` component (line 964) — a dedicated, already-reserved "Coming soon" placeholder whose own code comment reads: *"The paste/upload route is owned by spec 050 and is deliberately NOT built here; 044 only guarantees the affordance is present on page 2 alongside the other two (FR-016b)."* This is rendered on Phase B's unified build-list page, beside `ExemplarApplyAffordance` (line 840-841) — i.e., exactly where spec 044's own FR-016b already reserved a third slot for this feature.

**Rationale**: Two distinct, non-interoperating mechanisms exist for "text sample" today: (a) the older `pb_text_sample`/`pb_text_sample_review` modular question chain (reachable only via `IntroChooser`'s non-default "manual, step-by-step" path through `pb_discovery_intro`'s `"text-sample"` radio option), predating spec 044's build-list unification and never touched by its attribution/union treatment; and (b) this reserved, unbuilt placeholder on the now-primary build-list page. Building against (a) would mean bolting 044-style attribution onto a legacy path most authors never reach (the build-list page is `IntroChooser`'s DEFAULT). Building against (b) is what FR-016b already promised and is the literal target named in the shipped code comment.

**Alternatives considered**: Retrofitting `pb_text_sample_review` — rejected: it would require the SAME rebuild work (replacing its bool gate with a real per-character/attribution UI) while ALSO leaving the build-list page's placeholder unbuilt, satisfying neither path well. Deleting the older chain — out of scope (§3.8 no-delete; not authorized here) and not requested.

## R2 — The union/attribution mechanism already exists; this is a UI + adapter task, not new state design

**Decision**: Reuse `usePhaseBDraftStore`'s existing `addProposed(char: string, source: DraftProvenance, opts?) => void` method, calling it once per harvested character with `source: "text"`. `DraftProvenance` (`packages/studio/src/stores/phaseBDraftStore.ts:63`) is defined as `SourcedInventory["source"] | "author" | "text"` — **the `"text"` member already exists**, anticipating exactly this feature. `addProposed`'s documented contract (mirrored from `seedFromProposal`'s, lines 194-203) already satisfies FR-005/FR-006 verbatim: idempotent, never clobbers an author pick, respects sticky `rejected`, unions rather than overrides.

**Rationale**: `seedFromProposal(inv: SourcedInventory, bcp47?)` — the method `ExemplarApplyAffordance` uses for CLDR/SLDR — is the WRONG integration point: `SourcedInventory.source` is typed `ExemplarSource = "cldr" | "sldr"` (`packages/engine/src/character-discovery/exemplarTypes.ts:21`), which structurally excludes `"text"`. `addProposed` is the correct, already-provenance-aware, per-character alternative — no store change needed at all.

**Alternatives considered**: Widening `ExemplarSource` to include `"text"` and routing through `seedFromProposal` — rejected: would touch a type consumed across the exemplar-sourcing engine code (spec 044) for no benefit, when `addProposed` already exists as the exact right-shaped seam.

## R3 — Extraction: reuse `harvestFromText` verbatim, no new extraction path

**Decision**: Call `harvestFromText(sample: string, base: BaseKeyboard): Promise<InventoryChar[]>` (`packages/engine/src/character-discovery/CharacterDiscoveryServiceImpl.ts:366`) — already implements exactly what FR-004 asks for: NFC-normalizes at entry, segments by grapheme (`Intl.Segmenter`), drops whitespace/control characters, counts occurrences, tags each result `method: "text-sample"`. Map its `InventoryChar[]` output to `addProposed` calls (R2) — a thin adapter, not new extraction logic.

**Rationale**: FR-004 explicitly forbids a second extraction implementation. `harvestFromText` is already registered on the `CharacterDiscoveryService` contract (spec 008) and already has its own engine-level test suite (`CharacterDiscoveryServiceImpl.test.ts`) — reusing it needs no new engine code.

**Alternatives considered**: Calling the lower-level `harvestChars` (the pure function `pb_text_sample`'s older path and `PhaseB.tsx`'s manual single-line box both use) directly — rejected: `harvestFromText` already wraps it with the NFC-normalization contract and the `InventoryChar`/count/method shape this feature's UI needs; calling the lower-level function would mean re-deriving that wrapping.

## R4 — File upload: client-side `File.text()`, same extraction function, no new pipeline

**Decision**: FR-003 (upload) reads the file via the browser's native `File.text()` (or `FileReader.readAsText()` for older-browser fallback if the project's support matrix requires it — check `packages/studio`'s browserslist/target before deciding), then feeds the resulting string into the SAME `harvestFromText` call as the paste path (R3). No second extraction path, no server round-trip.

**Rationale**: Satisfies FR-010 (session-only, never uploaded off-device) trivially — the file never leaves the browser. Satisfies the Assumptions section's "plain text only" scope — `.docx`/`.pdf`/`.odt` extraction is explicitly out of scope; a non-UTF-8-decodable file surfaces the encoding failure FR-008/Edge-Cases ("fails loudly rather than proposing mojibake") calls for via `File.text()`'s own decode-error behavior (it throws or produces replacement characters depending on encoding — needs a concrete UTF-8 validity check at the adapter boundary, e.g. checking for the U+FFFD replacement character after decode, since `File.text()` does not throw on invalid UTF-8 by default).

**Alternatives considered**: A dedicated upload-parsing library — rejected: massive overkill for plain-text extraction the browser already does natively.

## R5 — Union with exemplar coverage (US3/FR-007): free, by construction

**Decision**: No dedicated "union" logic is needed. Because `ExemplarApplyAffordance`'s `seedFromProposal` and the new text-sample path's `addProposed` both write into the SAME `phaseBDraftStore.provenance`/`chars` state, and `addProposed`'s contract is already union-safe (unions, does not override; respects sticky rejection; never clobbers author picks per R2), accepting BOTH an exemplar offer and a text sample in the same session produces the union automatically — no new merge logic to write. US3's acceptance scenario (each character attributed to its source(s)) is satisfied by `provenance`'s existing per-character keying (one `DraftProvenance` value per NFC character; whichever wrote first wins attribution, per the existing `addWithProvenance` "author never clobbered" rule — extended here to mean the FIRST proposal source to write a given character keeps attribution, consistent with existing behavior for the CLDR/SLDR-vs-author case).

**Rationale**: Confirms FR-007's "no precedence rule between them" — the store's existing first-write-wins-for-provenance-only-if-not-author behavior already has no CLDR/SLDR-vs-text precedence rule; whichever proposal runs first attributes the character, which is the existing, already-shipped semantics for the CLDR/SLDR-vs-CLDR/SLDR case too (there is no other precedence rule to add).

**Alternatives considered**: A dedicated "both" provenance tag (e.g. `"cldr+text"`) for characters both sources attest — rejected: FR-007's edge case ("shown as attested by both rather than duplicated") is satisfiable by the UI layer cross-referencing both `provenance` (single-source-of-record) and each source's own raw result set for display purposes, without needing the store's core attribution model to grow a combinatorial tag set. This UI-layer display nuance is a task-level decision, not a research blocker.

## R6 — UI shape: mirror `ExemplarApplyAffordance`'s pattern, not build ad hoc

**Decision**: The new component (replacing `TextSamplePlaceholder`'s "Coming soon" body) should structurally mirror `ExemplarApplyAffordance` (`PhaseB.tsx:901`): a `<section data-testid="...">` with an `aria-label`, reading store state via `usePhaseBDraftStore` selectors, calling `addProposed` on submit. Needs its own local state for the textarea/file-input value (not store state — the raw pasted text is transient input, not part of the durable draft).

**Rationale**: Consistency with the established sibling pattern (same file, same page, same section styling) rather than inventing new UI conventions for what is functionally the same "accept a proposal into the draft" affordance shape.
