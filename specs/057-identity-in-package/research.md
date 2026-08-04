# Research: Identity in the package

Phase 0 for [plan.md](plan.md). Each entry records a genuine open choice, why it went the way it
did, and what was rejected. Audited against `main` at commit `70b6c620`.

No `NEEDS CLARIFICATION` markers remain in the spec — the 2026-08-03 clarification session
resolved all four (what changes, which fields, how the pre-instantiation stage is attributed, and
how the adapt track gets a descriptor). This document settles the design questions those answers
left open.

---

## D-01 — One descriptor writer, extracted from the scaffolder

**Decision.** Move `buildKpsContent` out of `packages/engine/src/scaffolder/index.ts` (where it is
a private function, line 307) into a new `packages/engine/src/package-descriptor/` module, and add
a second entry point beside it that *patches an existing descriptor or generates a missing one*.
`generateStubs` calls the builder; the projection calls the patch-or-generate entry point. Both
authoring tracks reach the descriptor only through this module.

**Rationale.** FR-005 requires exactly one writer, and E-6 is the concrete cost of not having one:
the copy track got its descriptor from `generateStubs`, the adapt track never calls the scaffolder
at all ([useKeyboardArtifact.ts:568-603](../../packages/studio/src/hooks/useKeyboardArtifact.ts#L568)),
and the divergence went unnoticed because the only thing that read the file on the adapt track —
the `<Version>` patch — no-ops silently when it is absent. A shared module makes the adapt track's
descriptor the *same* descriptor by construction rather than by review. Extraction is also what
makes the file testable on its own; today `buildKpsContent` can only be exercised through a full
`scaffold()`.

**Alternatives considered.**
- *Leave `buildKpsContent` private and add a second writer in the studio.* Rejected: this is the
  shape that produced E-6. Two writers means two `<Languages>` conventions the moment one changes.
- *Have the projection call `scaffold()` on the adapt track to get a descriptor.* Rejected:
  `scaffold()` fetches base source over the network and rewrites the whole VFS. Running it during
  projection would be a second instantiation, contradicting Constitution Article III.

---

## D-02 — The descriptor is written at projection step 3.6

**Decision.** Insert a package-descriptor step into `projectWorkingCopyVfs` **after** the keycap
label patch (step 3.5) and **before** the id-rename pass (step 4). It writes
`source/<keyboardId>.kps` under the *pre-rename* id and lets step 4 carry it to the target id.

**Rationale.** The descriptor's `<Files>` list is derived from the final `.kmn` — `&TARGETS`
decides whether a `.js` is listed, `&VISUALKEYBOARD` whether a `.kvk` is — so it must run after
every step that can rewrite the `.kmn`, which the identity step (3) is the last of. Running before
step 4 means the rename composes with no new code: `renameFilesInVfs` already moves
`source/<id>.kps` and `rewriteKpsFilePaths` already rewrites `<ID>` and the path-shaped `<Name>`
values in `<Files>`. Critically, that same function *deliberately skips* display names
(`if (!value.includes("/") && !value.includes(".")) return m` —
[scaffolder/index.ts:101](../../packages/engine/src/scaffolder/index.ts#L101)), so the author's
`<Info><Name>` and `<Keyboard><Name>` survive the rename untouched. This is the "fixed order"
the spec's Assumptions require, and it resolves the Edge Case about the two passes undoing each
other: the identity write always precedes the rename, never the reverse.

**Alternatives considered.**
- *After the rename (a step 5).* Rejected: the descriptor would then have to know both ids and
  duplicate the rewrite logic step 4 already owns.
- *In `serializeWorkingCopy` rather than in the shared projection helper.* Rejected outright by
  FR-004/SC-005 — the OSK preview path (`useWorkingCopyTransform`) would then see a different
  descriptor from the zip, which is the exact disagreement the shared helper exists to prevent.

---

## D-03 — The overlay carries the language name; the copy track starts carrying the tag

**Decision.** Add `languageName` to the projection's `IdentityOverlay` and to the store's
`IdentityPatch`, and populate both `bcp47` and `languageName` on the **copy** track from
`surveySessionStore.identityResult` at the point the identity step completes.

**Rationale.** The composed tag already exists — `extractIdentityLite` builds it via
`buildTargetBcp47` from `il_language_code`, `il_target_script`, and `il_language_region`
([IdentityLite.tsx:139](../../packages/studio/src/survey/IdentityLite.tsx#L139)) — and FR-001
forbids composing a second one, so this feature consumes `IdentityLiteResult.bcp47` whole. But it
never reaches the working copy: `identity.bcp47` is set *only* by `instantiateFromExisting`
(Track 2, from `keyboard.languages[0]`), while Track 1's writers
([TrackOneIdentityPanel.tsx:80](../../packages/studio/src/editors/panels/TrackOneIdentityPanel.tsx#L80),
[flowStepOptions.tsx:152](../../packages/studio/src/editors/adapters/flowStepOptions.tsx#L152))
set only `keyboardId` and `displayName`. That gap is why the copy track has no author tag to
write. `languageName` is genuinely new: the descriptor needs display text for the `<Language>`
element, and per the spec's Assumptions that is the **English** name (`IdentityLiteResult.english`),
not the autonym.

**Alternatives considered.**
- *Have the descriptor writer read `surveySessionStore` directly.* Rejected: the engine cannot
  import studio stores, and the projection helper is deliberately pure. The overlay is the
  established channel.
- *Use the autonym as display text.* Rejected by the spec's Assumptions — the `keymanapp/keyboards`
  corpus convention and the offline tables both carry the English name.
- *Re-parse the tag to recover a language name.* Rejected: FR-001's "never re-derive" applies, and
  the name is already in hand.

---

## D-04 — The counterfactual is two output projections, varied by one overlay field

**Decision.** Add an optional `identityOverride` parameter to `projectWorkingCopyForOutput`, and a
new `counterfactualProjection.ts` that calls it twice — once with the entry's recorded value, once
with the alternative — and diffs the two projections' text baselines. The override is a pure
input: the store is read as it stands and the override is merged over the overlay for that call
only.

**Rationale.** FR-010 is explicit that both sides must come from the projection that produces the
shipped keyboard, and names the tempting wrong answer (building the comparison from the keyboard
source emitter) as a violation of SC-005 even though it would satisfy the requirement's shape.
`projectWorkingCopyForOutput` is that function — it is already what `readProjectedFiles` delegates
to for boundary capture ([StudioShell.tsx:743](../../packages/studio/src/StudioShell.tsx#L743)),
for the download zip, and for the pull request. Threading an override through it means the
counterfactual is the same code path, differing only in one input, which is what makes the two
sides comparable at all. It also clones the VFS internally already, so neither projection can
disturb the working copy (Constitution Article III).

**Alternatives considered.**
- *Extend the existing `mutate()` seam.* Rejected, and the spec puts it out of scope: the seam is
  gated off and half-complete, and its `writes` containment is `IRPath`-space over `KeyboardIR` —
  it structurally cannot address a `.kps`.
- *Temporarily `setIdentity()` the alternative, project, then restore.* Rejected: mutating shared
  store state to answer a read-only question is a race against any concurrent render, and a thrown
  projection would leave the store holding the counterfactual value.
- *Diff the recorded value's projection against the boundary baseline.* Rejected: there is no
  baseline for the identity stage — that is E-5, the problem being solved.

**Cost, accepted.** Expanding one identity entry runs two full projections. That is the price of
FR-010, and FR-011 bounds it: nothing runs until an expand, and the pair is computed once per
expand and discarded. `resolveStepAlternative` (the flow-map's FR-026 path) gets the same treatment
for free, since it already routes through the same resolver.

---

## D-05 — A third unavailability reason, not an overloaded existing one

**Decision.** Add `"no-working-copy-yet"` to `ImpactUnavailableReason` in
`packages/contracts/src/decisionRecord.ts`, mirror it in the `z.enum` at
`packages/contracts/src/schemas.ts:637` in the same commit, and render it with its own message.

**Rationale.** FR-012 requires the author to be able to tell this state from the two existing ones
*and* from "changed nothing". Today an identity entry expanded before base selection would fall
through to `no-rederivable-write-path`, which after this feature would be false — the write path
exists, the working copy does not. The union is additive, so every existing consumer keeps
compiling; the three that switch on the reason
([prSummary.ts:206](../../packages/engine/src/decision-audit/prSummary.ts#L206),
[FlowGraphView.tsx:750](../../packages/studio/src/dashboard/FlowGraphView.tsx#L750),
[DecisionEntryRow.tsx:573](../../packages/studio/src/decisions/DecisionEntryRow.tsx#L573)) all use
an if/else chain with a final fallback, so each needs an explicit arm rather than silently
absorbing the new code into its `else`.

**Alternatives considered.**
- *Reuse `no-rederivable-write-path`.* Rejected by FR-012, and it would be a lie post-fix.
- *Return `null` and let the row render its shed notice.* Rejected: `null` already means "shed
  entry" and the shed notice says something different and wrong here.

---

## D-06 — Impact resolution becomes async at the row, on expand

**Decision.** Keep `resolveImpact` synchronous for stored captures and the existing seam path, and
add an async resolver for entries that need a counterfactual projection. `DecisionEntryRow`
consumes it through a new `useEntryImpact(entry, expanded)` hook that starts the work on expand,
renders a pending state, and abandons a result whose request was superseded by a collapse or a
newer expand.

**Rationale.** The projection is async — it pre-loads referenced patterns in a `Promise.all` before
it can build a synchronous `getPattern` — so there is no way to keep this in the render path.
Today `const impact = expanded && !isBaseContribution ? resolveImpact(entry) : null`
([DecisionEntryRow.tsx:480](../../packages/studio/src/decisions/DecisionEntryRow.tsx#L480)) is
called during render, which is exactly why FR-011 holds by construction. The hook preserves that:
the effect is keyed on `expanded`, so mount still computes nothing and collapsing still stops
short. Keeping the sync path for stored captures matters too — a stored capture must be returned
*verbatim* (SC-005), and routing it through an effect would introduce a frame in which a
long-recorded fact renders as pending.

**Alternatives considered.**
- *Make the whole resolver async.* Rejected: it would make every stored capture flicker through a
  pending state for no gain, and it would put an `await` in front of the one path whose whole point
  is that it is not re-derived.
- *Precompute identity counterfactuals at instantiation.* Rejected by FR-011 and 053 FR-010 — that
  is the batch form both forbid.

---

## D-07 — The FR-016 check is a registry-wide vitest, not a plain-node lint

**Decision.** Implement the anti-regression check as
`packages/studio/src/survey/questions/outputReach.test.ts`, running over `questionRegistry`. It has
two parts: (a) every `outputs` entry a question declares must name a target and overlay field that
the descriptor writer actually consumes, validated against a writer-owned table; and (b) a question
whose `help_text` or `prompt` contains a shipping promise must declare a non-empty `outputs` or a
non-empty `writes`.

**Rationale.** The declarations live in TypeScript modules, and the repo has already settled this
question once: `content-i18n-lint` is plain JS and *cannot* re-derive `flowQuestions.json` from
TS-module question definitions, which is precisely why spec 050 T015 added the tsx-run
`content-i18n-freshness` check alongside it (see CLAUDE.md's commands table). A new plain-node
linter over `packages/studio/src/survey/questions/**` would have to re-implement a TypeScript
parser to read `writes: []`. Vitest imports the registry directly, and `registry.test.ts` is
already the established home for registry-wide invariants.

Part (b) is the part that actually closes E-4, and it is deliberately a phrase heuristic over a
small curated list with an explicit allowlist escape hatch: part (a) alone would pass a question
that promises the world and declares `outputs: []`. A heuristic that occasionally needs an
allowlist entry is the honest trade — the failure mode is a maintainer writing one line of
justification, not a shipped false promise.

**Alternatives considered.**
- *A new `utilities/question-output-lint/`.* Rejected for the TS-parsing reason above.
- *Part (a) only.* Rejected: it does not satisfy SC-008, which is about the *promise*, not the
  declaration's internal consistency.
- *Type-level enforcement (a required `outputs` field).* Rejected as a follow-on, not a starting
  point: making the field required touches every shipped question module at once and would bury
  this feature's diff. The test enforces presence where it matters today.

---

## D-08 — Coverage asserts the descriptor's existence from the delivered artifact

**Decision.** For FR-017, add assertions that read the descriptor out of the *projection result* on
both tracks, without seeding it. `seedAdaptStore`'s optional `kpsContent` parameter
([serializeWorkingCopy.test.ts:433](../../packages/studio/src/lib/serializeWorkingCopy.test.ts#L433))
stays for the tests that legitimately need a pre-existing descriptor with an unusual shape, but the
new tests call it without one, and the Track-2 e2e walk gains the descriptor assertion the Track-1
walk already has ([copy-edit.spec.ts:243-266](../../packages/studio/e2e/copy-edit.spec.ts#L243)).

**Rationale.** E-7 names the defect exactly: every adapt-path assertion runs against a hand-seeded
entry, so the suite proves the version patch works *when* a descriptor is present and says nothing
about whether one ever is. Removing the seeding parameter entirely would be over-correction — some
tests need to pin a legacy descriptor shape to prove the `<Version>` regex's warning path. What
FR-017 forbids is a test *asserting the descriptor's behaviour* while supplying the descriptor, and
that is fixed by adding unseeded tests, not by deleting the helper.

**Alternatives considered.**
- *Make `kpsContent` required.* Rejected: it forces every caller to supply a fixture, which is the
  same "test pins the assumption" shape pointed the other way.
- *E2E only.* Rejected: e2e is out of the unit CI lanes, so a unit-level regression would ship.

---

## D-09 — The adapt track's descriptor is generated during projection, not fetched

**Decision.** When the projection's descriptor step finds no `source/<keyboardId>.kps`, it
generates one through the shared builder. The loader is unchanged.

**Rationale.** This is the spec's own clarification, and the loader's refusal is well-founded and
documented in place: the raw `.kps` references `../build/*.kmx` compiled artifacts that must not
leak into the VFS
([fetchKeyboardSourceToVfs.ts:192-194](../../packages/engine/src/loader/fetchKeyboardSourceToVfs.ts#L192)).
Generating means the `<Files>` list is derived from what *this* build emits, which is the same
guarantee the copy track has. Per FR-006, a step that cannot write the descriptor pushes a warning
rather than returning silently — the contrast with today's silent no-op is the point of E-6.

**Alternatives considered.**
- *Add `.kps` to the loader's sibling-fetch extension filter
  ([:183](../../packages/engine/src/loader/fetchKeyboardSourceToVfs.ts#L183)).* Rejected: it
  re-introduces the compiled-artifact leak the loader exists to prevent, and the spec calls this
  out as trading one defect for another.
- *Generate at instantiation instead of at projection.* Rejected: the descriptor depends on the
  final `.kmn` (targets, visual keyboard) and on identity answers that arrive later, so it would be
  stale the moment anything changed.

---

## D-10 — Volatile-content handling is extracted, not duplicated

**Decision.** Move `textBaseline` and `normalizeHistoryDateStamp` out of `snapshotSource.ts` into a
shared `packages/studio/src/decisions/projectedText.ts`, consumed by both the boundary snapshotter
and the counterfactual.

**Rationale.** FR-013 requires the volatile-content exclusion to apply to *both sides* of a
counterfactual comparison, not only to boundary captures. `stageAdaptHistory` stamps
`HISTORY.md` with `new Date()` on every projection, so two projections taken moments apart are
normally identical — but a counterfactual pair straddling local midnight would otherwise show a
spurious one-line change, which is the same bug 055's D-09 already fixed for boundaries. Extracting
rather than re-implementing means the excluded set can only grow in one place, which is what the
spec's Assumptions anticipate ("the excluded set grows rather than the comparison being
abandoned").

**Alternatives considered.**
- *Re-implement the normalization in the counterfactual module.* Rejected: two copies of an
  exclusion list is how one of them goes stale.
- *Skip normalization because both projections happen in the same tick.* Rejected: it is true today
  and would be silently false the first time a projection becomes slow or a second volatile field
  appears.
