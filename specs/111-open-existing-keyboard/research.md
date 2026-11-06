# Research: Open an existing keyboard (spec 111)

Phase 0 of [plan.md](plan.md). Each item answers one of the plan's unknowns, from a code read on 2026-11-03 (post-`5e1fb741`). Line numbers are evidence at that commit.

## R1. How is a code edit integrated into the IR without being clobbered by replay?

- **Decision**: on Open, an applied code edit (or an accepted text-level fix) **replaces the starting point**: the file text in the VFS is updated and re-parsed into a new starting IR. Recorded decisions replay on top of it.
- **Rationale**: replay rebuilds the IR from `startIr` through the checkpoint trail, and the trail reseeds when the `startIr` reference changes ([rebuildWorkingCopy.ts:318-352](../../packages/studio/src/decisions/rebuildWorkingCopy.ts)). A direct `setWorkingIR` edit is overwritten on the next decision change, which is the current code tab's latent bug. The VFS is never replayed, so text survives. Making the edit a new starting point uses the existing "switching the starting point keeps decisions and recalculates" rule (Constitution Article X) instead of inventing a checkpoint that replay must not cross.
- **Alternatives rejected**:
  - **Store code edits as decisions.** Text can't be a decision (owner ruling).
  - **A new non-crossable checkpoint.** It adds a second replay floor, more machinery for the same effect.

## R2. How do tool edits (galleries, fixes) reach the text without reformatting it?

- **Decision**: a projection `projectKmnText(startText, startIr, ir)`. It diffs the starting IR against the working IR by node ID into delete / replace / insert edits, and applies them as line splices on the starting text. It falls back to a full `emit` only when a splice is ineligible, and on Open only with the author's consent (FR-009). It replaces the `emitKmn` calls on the edit paths of [projectWorkingCopyVfs.ts](../../packages/studio/src/lib/projectWorkingCopyVfs.ts) (~:859, :1045, :1079) when the mode is Open.
- **Rationale**: carve already does this for deletions. `carveViaSplice` resolves a node's span from its start `sourceLine` and `joinContinuations`, so continued lines are covered (carveViaSplice.ts:60-68, continuation.ts:81-97), and the splice is refused when a node has no `sourceLine`. Node IDs from `startIr` survive replay, so a node present in both IRs is the same node. Replace means its emitted single-node text differs; insert means it has no `sourceLine`.
- **Building blocks**:
  - `emitRule` (emit.ts:136) and `emitStore` (emit.ts:388) exist but are only reachable by deep import, so they need a barrel export.
  - Insert placement: a new store goes after the last store; a new rule goes after the last rule of its group, or after the group header if the group is empty.
- **End lines**: not needed. The extent comes from the start line plus continuations, the same as carve.
- **Alternative rejected**: making emit preserve comments and order. It's a broad codec change, and about 415 corpus keyboards already diverge on re-emit.

## R3. How does the `.kps` get into the working copy safely?

- **Decision**: load the `.kps` into the VFS on Open with its `<File>` entries under `../build/` rewritten to the paths the studio's own packaging builds. Patch it in place at output.
- **Rationale**: the loader deliberately keeps it out today because of the `../build/*.kmx` references (fetchKeyboardSourceToVfs.ts:314-316), so that's the one hazard to neutralise. `patchKpsIdentity` (package-descriptor/patch.ts:406) is already an anchored regex patcher that preserves everything else. On Open it must skip:
  - the boilerplate `<Description>` (:417-428), unless the author edited the description;
  - the wholesale `<Languages>` replacement (:435-457). Write the author's edited list instead.

  Copy keeps today's behaviour (spec 057 SC-002).
- **Alternative rejected**: keeping the `.kps` as side text and regenerating at output. That is today's defect.

## R4. Source repository choice: a new proxy?

- **Decision**: no new proxy. Fetch either repository through the existing `/review-proxy/:owner/:repo/:sha/:path*` rewrite (vercel.json; Vite has the same `/review-proxy` entry), passing it as `proxyBase` to `fetchKeyboardSourceToVfs` (options `{ proxyBase?, fetchImpl? }`, :36-41).
- **Rationale**: the rewrite is already generic over owner, repo and commit. Pinning to a commit SHA also gives the PR body an exact "made against" reference (FR-004).
- **Difference test**: compare the `.kmn` and `.kps` text from the two repositories. "Curated in the fork" means the fork's copy is newer than upstream's; it uses the commit date of the file's last change on each side.

## R5. Classifying findings as new or pre-existing

- **Decision**: run the same criteria assembly over the opened working copy at load, store it as the baseline, and match later findings by **criterion id plus file**, ignoring line and message.
- **Rationale**: `useDocumentationFindings` already does this for docs with key `${docMember}:${code}` (:145-151), and `LintFinding` carries no line-stable identity. Criteria resolve by `lintRuleId`, so code plus file identifies a criterion's finding on a file. A criterion that fails on both sides is pre-existing even if the specific message changed. That's acceptable for a ratchet.
- **Reuse**: `judgeForeignKeyboard` (criteria/judgeForeign.ts:284) is already "VFS in, verdicts out" and runs in a worker. `baselineDocFindings` in the store becomes the general baseline.

## R6. Gating the identity-first steps off for Open

- **Decision**: the Open entry records the existing `authoring-track` decision with value `"adapt"` at instantiation, so the internal enum stays unchanged. Then declare screen gates for `identity_lite`, `layout`, `choose_base` and `track` as `(d) => d["authoring-track"]?.value !== "adapt"`.
- **Rationale**: screen gates see only the DecisionSet (registry.ts:180-186). `instantiationMode` is store state, invisible to gates. Recording the track decision at entry needs no new decision kind and no contracts change (Article IX: declarations, not a hand-kept list).
- **Alternative rejected**: widening the gate signature to take store state. It would break the "gates are pure functions of decisions" model.

## R7. Code tabs on Open

- **Decision**: on Open, each pane's text source is the VFS file text, not `emit*(ir)`. Apply writes the text to the VFS and replaces the starting point (R1). The touch pane's structural-edit refusal (TouchCodePane.tsx:196-211) does not apply on Open, because a text edit is a new starting point, not a key-edit batch.
- **Rationale**: none of the panes read the VFS today, so this is a change of text source and Apply target only. Copy keeps the canonical-emit behaviour.

## R8. Help-doc sections

- **Decision**: generated content is replaced only between the existing `<!-- ks:generated:start -->` and `<!-- ks:generated:end -->` markers (docSlots.ts:143-144). On a hand-written page without markers, the suggested fix appends a marked block before `</body>`. Hand-written prose is never edited.
- **Rationale**: `spliceGenerated` (helpDocsRender.ts:297) and `stripGeneratedBlocks` (docSlots.ts:155) already implement this. This resolves the spec's "help without markers" unknown: the answer is append-only, by design.

## R9. Version bump

- **Decision**: on Open, when `&KEYBOARDVERSION` is absent, insert it after `&VERSION` with the bumped value. Never change `&VERSION`.
- **Rationale**: the write site, stub-mutator/index.ts:73-77, rewrites an existing `&KEYBOARDVERSION` line only. When the line is absent the bump is silently not written, so the shipped version and the `.kps` disagree. The earlier suspicion that `&VERSION` gets bumped was wrong; the real bug is a silent no-op.

## R10. Consistency suggestions

- **Decision**: after each Apply, diff `buildProducedSet(ir)` and `computeTouchCoverage(layout, inventory)` before and after, scoped to characters this change added or removed. Layers use the 11.6 `data-states` extraction.
- **Rationale**: both functions exist in contracts and are shared with keyboard-lint.
- **Limit**: nothing computes which characters the help mentions, so the docs side of a suggestion is "refresh the generated character section" (R8), not "add this character to the prose".

## R10a. Expected characters for multilingual keyboards (owner note, 2026-11-03)

- **Decision**: the expected inventory on Open is the union of `sourceExemplars(tag)` ([engine/src/character-discovery/exemplarSource.ts:238](../../packages/engine/src/character-discovery/exemplarSource.ts)) over the `.kps` language list, after NFC normalisation. Tags returning `null` (no CLDR/SLDR data) are counted and reported, never guessed. The union feeds the existing 18.6 inventory-coverage check as its linguist inventory, so missing characters are ordinary findings and go through the ratchet (R5).
- **Rationale**: the function already handles CLDR-then-SLDR precedence, script-constrained tags and confidence gates, and is synchronous after `loadExemplarSource()`. 18.6 already turns "inventory character not producible" into findings, with fixes into the mechanisms gallery.
- **Caveat**: `useInventoryCoverageGate` makes 18.6 the studio's one hard download gate. On Open it must follow the ratchet: pre-existing gaps don't block, and new gaps (e.g. from an added language) need a fix or a review note.
- **Scale**: a 278-language keyboard calls the function 278 times. It's an index lookup, so this is negligible.

## R11. Old Adapt drafts

- **Decision**: restore through `prepareWorkingCopySnapshot` (persistWorkingCopy.ts:537-549) unchanged, since `instantiationMode` stays `"adapt-existing"`. On restore, if the snapshot lacks the `.kps` in `startVfsEntries`, list the regenerated files at the next output as changes the author can keep or revert.

## R12. PR body

- **Decision**: append two blocks to the body array at [ManagedPRSubmitPanel.tsx:344-353](../../packages/studio/src/components/ManagedPRSubmitPanel.tsx):
  1. the source block: repository, commit, keyboard path;
  2. the review block: each review note beside its criterion, plus inherited failures as a list.

  `generatePRBody.ts` stays checklist-only.
