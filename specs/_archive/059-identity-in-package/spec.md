# Feature Specification: Identity in the package — the author's language reaches the `.kps`, and the trail can show it

**Feature Branch**: `059-identity-in-package`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Spec 55 did a good job, but there are still sections that don't show a diff. We should be able to show diffs where fields like language name and language code are encoded into the KPS."

## Governing documents

This spec **implements**, and does not restate, the following. On conflict, they win.

- [specs/053-decision-audit/spec.md](../053-decision-audit/spec.md) — the decision audit. FR-008…FR-011 (attribution, on-request impact, state the reason), FR-016 (localized text is the studio's, not the engine's), and SC-005 (the audit and the artifact never disagree) **stand unchanged**. This feature does not revise them.
- [specs/055-legible-decision-trail/spec.md](../055-legible-decision-trail/spec.md) — FR-016…FR-021 (whole-package comparison, per-file identification, volatile-content exclusion, joint attribution, on-request only) **stand unchanged**. 055 widened *what is compared*; this feature supplies the change there was to find. See the Problem statement: 055's defect D-3 rests on a premise that turns out to be false, and this spec corrects that premise rather than 055's requirements.
- [specs/030-langtags-identity-autocomplete/spec.md](../030-langtags-identity-autocomplete/spec.md) — the identity-lite question series (`il_language_english`, `il_language_autonym`, `il_language_code`, `il_language_region`, `il_target_script`) and the composed BCP47 tag. The tag composition rule already exists there and MUST be reused, never re-derived.
- [spec.md](../../spec.md) §11 (VirtualFS + package output) and §12 (team boundaries). The package descriptor is an Engine-team output artifact; author-facing prose in `welcome.htm` / `readme.htm` is a Content-team surface and stays out of scope. Constitution Article VII already places multi-language `welcome.htm` variants out of scope for v1, which this exclusion is consistent with.
- Constitution Article V (VirtualFS only during authoring) — the descriptor is written into the in-memory working copy and serialized only at output. Nothing here writes to host disk.
- [specs/046-i18n-localization/contracts/catalog-format.md](../046-i18n-localization/contracts/catalog-format.md) — message-id rules for any new author-facing string. Ids are permanent handles.
- [CLAUDE.md](../../CLAUDE.md) "Contract source-of-truth chain" — a type change in `packages/contracts` MUST land with its zod mirror in the same commit; the compile-time drift guards enforce it.
- Constitution Article IV (single 300 ms debounce cycle) — this feature adds no validation timer. Projection happens on step-completion events and on explicit expand.

## Problem statement

Spec 055 set out to fix, among other things, a trail that said this about the author's own language:

```
Chose Ewondo for il_language_english
  This question has no re-derivable write path in this build, so its effect cannot be shown on its own.
Chose ewo for il_language_code
  This question has no re-derivable write path in this build, so its effect cannot be shown on its own.
```

055 diagnosed this as a *comparison* problem: the impact sources read the `.kmn` alone, so a decision that only touched package metadata had its change looked for in the wrong file. Its D-3 states that "identity answers land in the `.kps` through the projection's identity overlay", and FR-016 correctly widened the compared set to every text file the projection emits.

The widening shipped and works. The message did not change, because **the premise was false**: identity answers do not land in the `.kps`. Nothing in the pipeline writes the author's language name or language code into any emitted file. 055 widened the search; there was nothing to find.

So the author still reads "its effect cannot be shown" about a value they can see printed on the finished keyboard — except that they cannot see it there either, because it never arrives. The trail's message is the honest report of a deeper defect: **the author's language is not in the package.**

### Observed defects

Audited against `main` at commit `70b6c620`, 2026-08-03. Each is evidence for a requirement below, not a task list.

- **E-1 — the identity questions declare no writes, so impact resolution short-circuits.** `il_language_english`, `il_language_autonym`, `il_language_code`, and `il_language_region` each end with `writes: []` ([il_language_code.ts:49](../../packages/studio/src/survey/questions/a/il_language_code.ts#L49)). `resolveImpact`'s counterfactual path bails at `if (writes.length === 0) return null` ([impact.ts:93](../../packages/studio/src/decisions/impact.ts#L93)) and falls through to `{ state: "unavailable", reason: "no-rederivable-write-path" }`. The rendered message is literally true of the current wiring.

- **E-2 — the package declares the *base* keyboard's language, not the author's.** `generateStubs` passes `base.languages ?? []` into `buildKpsContent` ([scaffolder/index.ts:510](../../packages/engine/src/scaffolder/index.ts#L510)), which emits `<Language ID="{tag}">{tag}</Language>` per tag ([:333](../../packages/engine/src/scaffolder/index.ts#L333)). A new Bambara keyboard built on a French base ships a package that declares `fr`, with `fr` as its own display text. This is wrong in the artifact independently of any audit concern: it misfiles the keyboard for every downstream consumer of the package descriptor.

- **E-3 — no projection step writes identity into the `.kps`.** Projection step 3 builds an `identityArg` of `{ name, copyright, version }` and hands it to `applyIdentityStubMutation`, which touches the `.kmn` only — the code comment says so ([projectWorkingCopyVfs.ts:438](../../packages/studio/src/lib/projectWorkingCopyVfs.ts#L438), [:461](../../packages/studio/src/lib/projectWorkingCopyVfs.ts#L461)). The id-rename pass's `rewriteKpsFilePaths` rewrites `<ID>` and path-shaped `<Name>` values but **deliberately skips display names** — `if (!value.includes("/") && !value.includes(".")) return m` ([scaffolder/index.ts:101](../../packages/engine/src/scaffolder/index.ts#L101)). And `header.bcp47` is never emitted by the codec: `packages/engine/src/codec/emit.ts` contains no reference to it, so the field is set by the survey, read by the OSK preview and carve case-pairing, and serialized nowhere.

- **E-4 — the product already promises the opposite.** `il_language_code`'s help text reads "This is the standard code for the language you picked — **it goes on the finished keyboard.** It is filled in from your choice above" ([il_language_code.ts:24-28](../../packages/studio/src/survey/questions/a/il_language_code.ts#L24)). The author is told the value ships. It does not. This is the defect stated in the author's own terms.

- **E-5 — the identity stage runs before there is anything to project.** `identityStep` is first in the manifest, ahead of `chooseBaseStep` ([manifest.ts:99](../../packages/studio/src/steps/manifest.ts#L99)). At that boundary `readProjectedFiles()` returns `null` (no working copy), so `captureAtBoundary` returns `null` before computing anything ([snapshotSource.ts:148](../../packages/studio/src/decisions/snapshotSource.ts#L148)) and no impact is attached. Fixing E-2/E-3 alone does not make these entries legible: the boundary that would have captured the change happened before the artifact existed.

- **E-6 — on the adapt track there is no `.kps` in the working copy at all.** `fetchKeyboardSourceToVfs` states that "the raw `.kps` is NOT written to the VFS (it references compiled artifacts like `../build/*.kmx` that must not leak into the VFS)" ([:192-194](../../packages/engine/src/loader/fetchKeyboardSourceToVfs.ts#L192)); it parses the `.kps` for font and stylesheet references and discards it. Step 3's sibling fetch is driven by the `.kmn`'s path stores and its extension filter does not include `.kps` ([:183](../../packages/engine/src/loader/fetchKeyboardSourceToVfs.ts#L183)). The adapt track (`scaffoldSpec == null`) takes that path and never calls the scaffolder ([useKeyboardArtifact.ts:568-603](../../packages/studio/src/hooks/useKeyboardArtifact.ts#L568)), so `generateStubs`' package generation never runs for it. Consequently `serializeWorkingCopy`'s `<Version>` patch reads `undefined` and no-ops **silently** — its "could not update .kps" warning only fires when the file exists and the regex misses ([serializeWorkingCopy.ts:219-235](../../packages/studio/src/lib/serializeWorkingCopy.ts#L219)). An adapted keyboard is delivered without a package descriptor.

- **E-7 — the `.kps` tests seed the file they should be proving exists.** Every adapt-path `.kps` assertion in `serializeWorkingCopy.test.ts` runs against a hand-seeded entry via `seedAdaptStore(version, kpsContent)` ([:433-441](../../packages/studio/src/lib/serializeWorkingCopy.test.ts#L433)), whose `kpsContent` parameter is optional. The tests prove the version patch works *when a `.kps` is present* and assert nothing about whether one ever is. The only test that requires a `.kps` in the delivered artifact is the Track-1 e2e walk ([copy-edit.spec.ts:243-266](../../packages/studio/e2e/copy-edit.spec.ts#L243)); no Track-2 equivalent exists. This is the same shape as 055's D-6 — a test that pins the assumption rather than checking it.

The common shape across E-2, E-3 and E-6 is worth naming, because it is what the anti-regression requirements below are aimed at: **a value the author is asked for, and told will ship, that no output writer consumes.** The audit surface is where it became visible, but the audit was not wrong.

## Clarifications

### Session 2026-08-03

- Q: The trail cannot show a change that is not in the artifact. Does this feature change what ships, or only what the trail says? → A: It changes what ships. The `.kps` must carry the author's language; the trail requirement then follows, and per 055 FR-016 the diff surfaces with no change to the audit's comparison code. A trail-only fix is not available, because there is no change to attribute.
- Q: Which `.kps` fields carry the author's identity? → A: `<Keyboards><Keyboard><Languages>` carries the author's composed BCP47 tag with the language's name as the element text; `<Info><Name>`, `<Info><Description>`, and `<Keyboards><Keyboard><Name>` track the author's display name. `welcome.htm` / `readme.htm` language propagation is explicitly excluded — those are Content-team surfaces (spec §12).
- Q: The identity stage completes before instantiation (E-5), so no boundary capture exists for it. Split the flow, or re-derive on request? → A: Re-derive on request. Expanding an identity entry re-projects the working copy with the entry's recorded value and with the alternative, and diffs the two projections. The manifest's stage order is not changed, 053's one-capture-per-boundary model is untouched, and 055 FR-021's on-request discipline is preserved because nothing is computed until an entry is expanded.
- Q: On the adapt track there is no `.kps` to write into (E-6). Fetch the base's, or generate one? → A: Generate one, through the same single writer the copy track already uses. Fetching the base's raw `.kps` is what `fetchKeyboardSourceToVfs` deliberately refuses to do, for the stated reason that it references compiled artifacts; re-introducing that would trade one defect for another. One writer keeps the two tracks from drifting.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The finished package declares the author's language (Priority: P1)

An author builds a Bambara keyboard on a French base. They are asked for their language's name and its code, and they answer. The package they download declares Bambara, under the author's own composed language tag — not French.

**Why this priority**: This is the defect in the artifact. Everything else in this feature is a report about it. A package that misdeclares its language is wrong for every downstream consumer regardless of whether anyone reads the trail, and it is the thing the author was explicitly promised (E-4).

**Independent Test**: Complete an authoring walk that answers the identity questions, download the package, and read the `.kps`. Fully testable without opening the decision trail at all.

**Acceptance Scenarios**:

1. **Given** an author who answered the identity questions with a language name and code, **When** they download the package, **Then** the package descriptor's language block declares their composed language tag with their language's name as its display text, and does not declare the base keyboard's language.
2. **Given** an author who set a display name for their keyboard, **When** they download the package, **Then** the descriptor's package name, description, and keyboard name all reflect that display name rather than the base keyboard's.
3. **Given** an author who left the language code blank (it is an optional question), **When** they download the package, **Then** the descriptor declares a well-formed placeholder rather than the base's language or an empty language block, and the package still builds.
4. **Given** the same session, **When** the author compares the on-screen preview, the downloaded archive, and a submitted pull request, **Then** all three carry the same identity — they are produced by one projection (053 FR-009, SC-005).

---

### User Story 2 - The identity decisions show what they changed (Priority: P1)

The author opens the decision trail and expands "the language code you chose". Instead of "its effect cannot be shown", they see the package descriptor named as the changed file and the language line as the change.

**Why this priority**: This is the reported symptom and the reason the defect was found. It is P1 alongside US1 rather than below it because US1 without US2 leaves the trail still saying it cannot report a change that now demonstrably exists — a worse state than today, since the message would then be false rather than merely unhelpful.

**Independent Test**: With US1 in place, complete an identity walk, instantiate a working copy, expand each identity entry in the trail, and check that a per-file change is shown naming the package descriptor.

**Acceptance Scenarios**:

1. **Given** an author who answered the language-code question and then chose a base, **When** they expand that entry in the trail, **Then** the change is shown with the package descriptor identified as the affected file, per 055 FR-017.
2. **Given** an author who has answered the identity questions but not yet chosen a base, **When** they expand an identity entry, **Then** the trail says the effect cannot be shown *yet* because no working copy exists — distinct both from "changed nothing" and from the two existing unavailability reasons (055 FR-020).
3. **Given** an identity entry whose effect is shown, **When** the author collapses it and expands a different entry, **Then** no impact was computed for any entry other than the one expanded (055 FR-021, 053 FR-010).
4. **Given** several identity answers resolved in the same stage, **When** the author expands one, **Then** the change is attributed jointly and names its co-decisions, per 055 FR-019 — never claimed by one answer alone.

---

### User Story 3 - An adapted keyboard ships a package descriptor (Priority: P2)

An author imports an existing keyboard, adapts it, and downloads the result. The archive contains a package descriptor carrying their identity — as the copy track's already does.

**Why this priority**: P2 because it affects one of two tracks, but it is a prerequisite for US1 and US2 *on that track*: there is no descriptor to write into and none to diff (E-6). Without it, this feature would deliver the copy track only, silently.

**Independent Test**: Run an import-and-adapt walk, download, and assert the archive contains a non-empty package descriptor whose language and name match the author's answers.

**Acceptance Scenarios**:

1. **Given** an imported keyboard adapted by the author, **When** they download the package, **Then** the archive contains a package descriptor, and its language and name reflect the author's answers.
2. **Given** an adapted keyboard whose version was bumped, **When** the descriptor is written, **Then** its keyboard version agrees with the `.kmn`'s keyboard version — the disagreement the existing version patch exists to prevent cannot arise from a missing file.
3. **Given** a projection step that cannot write the descriptor for any reason, **When** the author downloads, **Then** a warning names the failure — silence is not an acceptable outcome (contrast E-6).

---

### User Story 4 - Revising the language keeps both answers on the record (Priority: P3)

An author who mistyped their language code returns to the identity stage and corrects it. The trail shows the correction and what it changed, and the original answer remains visible as history.

**Why this priority**: P3 — a less common path, and it rides on 053 FR-015's existing supersede semantics rather than adding a mechanism. Worth stating because the revision happens *after* instantiation, so it is the one identity path that gets an ordinary boundary capture, and the two mechanisms must agree.

**Independent Test**: Complete a walk, revisit the identity stage, change the language code, and inspect both entries in the trail.

**Acceptance Scenarios**:

1. **Given** an author who revises their language code after instantiation, **When** the stage completes, **Then** the change to the package descriptor is captured at that boundary and attributed to the revising decision.
2. **Given** that revision, **When** the author reads the stage group, **Then** the superseded original is still visible as history (053 FR-015, 055 FR-026), and the stage's roll-up reads from the effective answer only.
3. **Given** an expanded revised entry and an expanded original entry, **When** both are shown, **Then** the two accounts do not contradict each other about what the descriptor now contains.

---

### Edge Cases

- **The author's language code is blank.** The question is optional (`required: false`) and free-text. The descriptor must remain well-formed and buildable; a placeholder is declared rather than the base's language or an empty language block (US1-3).
- **The author's language matches the base's.** Someone building a French keyboard on a French base gets a descriptor identical to today's for the language block. The trail must then report "changed nothing" for that answer, not fabricate a change and not report unavailability (053 FR-011).
- **The composed tag carries a script or region subtag.** The tag is composed by the existing identity-lite rule; this feature consumes it whole and does not re-derive or re-parse it.
- **No language name is available** — the author typed a code for a language absent from the offline tables. The descriptor still needs display text for the language element; the tag stands in, which is what the current writer already does for every tag.
- **The author renames the keyboard after the descriptor is written.** The rename pass already rewrites in-file id references; the identity write and the rename must compose in a defined order and not undo each other.
- **A revisit changes the language *back* to a previous value.** Two boundary captures now describe opposite changes; both stay on the append-only record and neither is rewritten.
- **The projection is asked for a counterfactual before a working copy exists.** Reported as its own state (US2-2), never as "changed nothing".
- **Volatile content.** Re-projecting twice to derive a counterfactual must not surface content that changes on every projection regardless of the decision — 055 FR-017a's exclusion applies to both sides of the comparison, not only to boundary captures.

## Requirements *(mandatory)*

### Functional Requirements

**The package carries the author's identity**

- **FR-001**: The produced package descriptor MUST declare the author's language, not the base keyboard's. The declared language MUST be the tag already composed by the identity-lite series (specs/030); this feature MUST NOT introduce a second tag-composition rule.
- **FR-002**: The declared language's display text MUST be the language's name as the author confirmed it, falling back to the tag itself when no name is available.
- **FR-003**: The descriptor's package name, package description, and keyboard name MUST reflect the author's chosen display name.
- **FR-004**: FR-001…FR-003 MUST be satisfied through the single shared output projection that already produces the on-screen preview, the downloaded archive, and the submitted pull request. No output path may compute identity independently (053 FR-009, SC-005).
- **FR-005**: There MUST be exactly one writer of the package descriptor's identity fields, used by both authoring tracks. A second track-specific writer is a defect (E-6 is what two paths with one writer produced).
- **FR-006**: Both authoring tracks MUST deliver a package descriptor. Where one cannot be written, a warning MUST name the failure; silent absence is not acceptable.
- **FR-007**: An optional identity answer left blank MUST leave the descriptor well-formed and buildable, and MUST NOT cause the base keyboard's value to be declared as the author's.
- **FR-008**: The descriptor's keyboard version MUST continue to agree with the keyboard source's version, on both tracks.

**The trail can show it**

- **FR-009**: A decision recorded before a working copy exists MUST be able to have its effect resolved on request once one exists, by comparing a projection made with the decision's recorded value against one made with the alternative.
- **FR-010**: Both sides of that comparison MUST come from the same projection that produces the shipped keyboard (055 FR-018). A comparison built from the keyboard source emitter instead would satisfy the requirement's shape and violate SC-005.
- **FR-011**: The comparison MUST be performed only for the entry the author expanded, and only when they expand it (055 FR-021, 053 FR-010). No batch form, and no computation on trail mount.
- **FR-012**: Where the effect genuinely cannot be resolved because no working copy exists yet, that MUST be reported as its own reason, distinguishable by the author from the two existing unavailability reasons and from "changed nothing" (055 FR-020, 053 FR-011).
- **FR-013**: Content that changes on every projection independently of any decision MUST NOT appear in a counterfactual comparison, on either side (055 FR-017a).
- **FR-014**: Where an identity stage resolved several answers, their shared change MUST be attributed jointly, per 055 FR-019 — no answer claims it alone.
- **FR-015**: Any new author-facing text MUST be added to the studio's own catalog under the established id convention (053 FR-016, specs/046). No English prose introduced in the engine for the author to read.

**Anti-regression**

- **FR-016**: Every question whose answer reaches an output file MUST declare that it does. A question the author is told will ship a value, whose answer no writer consumes, is the defect class this feature closes (E-1, E-4) and MUST be detectable rather than discovered by reading the artifact.
- **FR-017**: A test that asserts behaviour of the package descriptor MUST NOT supply the descriptor it is proving exists. Coverage MUST include, for both tracks, that the delivered artifact contains one (E-7).
- **FR-018**: `il_language_code`'s help text promise ("it goes on the finished keyboard") MUST be true when this feature lands, or the text MUST change. It MUST NOT remain a claim the build does not honour. The intended resolution is to make it true, which is an Engine-team change; changing survey text instead would be a Content-team edit (spec §12) and is the fallback, not the plan.

### Key Entities

- **Package descriptor** *(existing artifact)*: the `.kps` in the projected working copy. Gains author-identity fields as projected content rather than scaffold-time-only content. Its language block moves from "the base's tags" to "the author's tag and language name".
- **Identity overlay** *(existing, `packages/studio`)*: the working copy's post-instantiation identity patch. Already carries the display name and composed tag; this feature makes both reach the descriptor, and may need the language's display name alongside them.
- **Decision impact** *(existing, `packages/contracts`)*: unchanged in shape by this feature. It gains one new unavailability reason (FR-012); the per-file change set 055 introduced is what carries the descriptor's diff, with no widening needed.
- **Counterfactual projection** *(new, derivation only)*: a pair of projections of the current working copy differing only in one identity value, compared to attribute that value's effect. Derived on request, never stored — storing it would create a second account of the artifact that could disagree with the first.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author who names their language and confirms its code can find both in the package they download, on either authoring track, in 100% of completed walks.
- **SC-002**: Zero delivered packages declare the base keyboard's language as the authored keyboard's language.
- **SC-003**: Zero delivered packages lack a package descriptor.
- **SC-004**: For every identity answer that reached the artifact, the trail states what it changed and names the changed file. None report an unavailability reason once a working copy exists.
- **SC-005**: The on-screen preview, the downloaded archive, and a submitted pull request agree on the authored keyboard's identity in 100% of sessions — no configuration in which they can disagree.
- **SC-006**: Expanding one identity entry computes an impact for that entry and no other, and the trail continues to mount having computed none (053 SC-007's "no perceptible delay" holds by construction, not by being fast).
- **SC-007**: A reader of the trail can state, for each identity decision, which file changed and how — the audit's account and the artifact's content never disagree (053 SC-005).
- **SC-008**: A question that promises the author its value ships, but whose value no writer consumes, is caught by a repository check rather than by inspecting a downloaded package.

## Out of scope

- **`welcome.htm` / `readme.htm` language propagation.** Author-facing package prose is a Content-team surface (spec §12) and follows its own review path. Explicitly excluded by the user at scoping.
- **Enabling the `mutate()` seam.** It remains gated off by design; FR-009's counterfactual uses the real projection, not the seam, so nothing here depends on that rollout decision.
- **Emitting the language tag into the keyboard source.** The codec does not serialize `header.bcp47` today (E-3). Whether it should is a codec/round-trip question with its own compatibility surface; this feature puts the tag in the package descriptor, which is where the Keyman package format carries it.
- **Changing the manifest's stage order.** The identity stage stays ahead of base selection; FR-009 resolves the ordering problem by re-derivation rather than by moving the stage (Clarifications).
- **Changing the locked `Pattern` schema** or reopening any resolved decision D1–D9.
- **Retrofitting records written before this feature.** An existing record's identity entries keep whatever they were written with; nothing rewrites the append-only record.

## Assumptions

- The language's display text in the descriptor is the **English name** the identity series resolved, matching the convention in the `keymanapp/keyboards` corpus and the name the offline language tables already carry. The autonym is collected for other purposes and is not the descriptor's display text.
- The composed BCP47 tag — including any script and region subtags — is taken whole from the identity-lite series. This feature neither re-composes nor validates it beyond what that series already does.
- A blank language code yields the same well-formed placeholder the current writer already emits when a base declares no language, so no new placeholder convention is introduced.
- The adapt track's descriptor is **generated** by the same writer the copy track uses, not fetched from the base keyboard's repository — fetching the raw base descriptor is what the loader deliberately refuses to do, for the stated reason that it references compiled build artifacts (E-6).
- Two projections of the same working copy differing only in one identity value are otherwise byte-identical within a session, given 055 FR-017a's existing treatment of volatile content. If that turns out to be false for some emitted file, the excluded set grows rather than the comparison being abandoned.
- The identity write and the existing id-rename pass compose in a fixed order within the one projection helper, so no ordering ambiguity is introduced between them.
- Fixing the descriptor changes the bytes the compiler and the existing walk tests see. Fixture and baseline updates are expected work, not a signal that the change is wrong.
