# Research: Help documentation generation from Phase F answers

## D-01: Answers live on a dedicated store field, not the `writes`/`mutate` pipe

**Decision**: Add `helpDocs: HelpDocsAnswers | null` directly to `workingCopyStore`, populated by a
new `onCommit` on `phaseFOptions` (`packages/studio/src/editors/adapters/flowStepOptions.tsx`) that
calls a new `extractHelpDocs(result: SurveyPhaseResult)` and a new `setHelpDocs` store action.

**Rationale**: Traced the only other free-text answer that already reaches the working copy
(`il_copyright_holder` → `attribution`) end to end: `IdentityLiteAdapter.handleComplete`
(`panelAdapters.tsx:102-114`) calls `setAttribution(identity.attribution)` **directly** — the
generic `QuestionModule.writes`/`mutate()`/`applyMutatePatch` pipe (`steps/mutateApply.ts`,
`steps/reducer.ts:567`) is a no-op for every live module today, including the one demoted module
that still declares `writes`/`mutate` (`survey/questions/reserve/pa_copyright_holder.ts`, explicitly
marked dead in `registry.reserve.ts`). Building on the unimplemented generic pipe would mean
unblocking a project-wide mechanism (tracked separately as T014) as a side effect of this feature —
out of this spec's scope. `makeFlowStepComponent.tsx` already has the exact hook point
(`options.onCommit?.(extracted, depsRef.current)`, called after `extract` and before
`onComplete`) that `trackOptions`/`projectNameOptions` use for their own store writes, so Phase F
gets the identical pattern with zero new plumbing beyond adding `setHelpDocs` to `FlowStepDeps`.

**Alternatives considered**: (a) Implement the generic `writes`/`mutate` pipe for Phase F's modules
— rejected, unblocks a much larger, separately-tracked mechanism. (b) Store answers inside
`KeyboardIR` — rejected, violates Constitution Article II (KeyboardIR is the compiled-keyboard
spine; help-doc prose is package/output metadata, not part of the compiled artifact, exactly the
same reasoning that already keeps `attribution` off the IR).

## D-02: One shared pure render module, not four independent template functions

**Decision**: New `packages/engine/src/shared/helpDocsRender.ts` exports a `buildDocSections(answers:
HelpDocsAnswers | null): DocSection[]` shared by both `renderWelcomeHtm` and `renderHelpPhp`, plus
`renderReadmeMd` and `renderReadmeHtm`. `packageDocs.ts`'s existing `welcomeHtm`/`readmeHtm` either
become thin wrappers or are retired in favor of direct calls into the new module (implementer's
call — either is compatible with existing imports).

**Rationale**: FR-005 requires the welcome page and help page to never visibly disagree. The
existing corpus review checklist (docs/keyboard-documentation-plan.md's "final consistency pass")
names exactly this defect class as the #1 recurring reviewer finding. A single section-builder
function that both files render from is a structural guarantee of parity, not a style preference —
two independently-written template strings drift the same way two independently-written LICENSE.md
copies already did (spec 064's motivating incident, same doc).

**Alternatives considered**: One render function per file with duplicated section logic — rejected,
reintroduces the exact drift risk FR-005 exists to prevent.

## D-03: Regeneration hooks into `projectWorkingCopyForOutput`, not `buildOutputBundle`

**Decision**: The render/merge step runs inside `projectWorkingCopyForOutput`
(`packages/studio/src/lib/serializeWorkingCopy.ts`), after the descriptor/id-rename work (around
its existing step 5b "Track 1 output-only completion"), writing directly into `clonedVfs`. It does
**not** live in `buildOutputBundle.ts`'s `ensurePackageFiles` call.

**Rationale**: `ensurePackageFiles` only runs on the `.kmp` download path (`buildOutputBundle.ts`);
the `.zip` download (`zipProjectedVfs`) and the GitHub fork+PR path both call
`projectWorkingCopyForOutput` directly and never touch `ensurePackageFiles`. The spec's own
Assumptions section states "produce the output package" covers all three delivery modes equally.
`ensurePackageFiles`'s write-if-absent guard is also structurally wrong for this feature regardless
of call site: FR-010 requires every production to reflect the *current* answers, but
write-if-absent only fires once (whoever wrote first, wins forever) — the opposite of "regenerate
every time."

**Alternatives considered**: Call the new render step from all three call sites separately —
rejected, triples the maintenance surface for no benefit over hooking the one function they all
already share.

## D-04: FR-002 fallback reuses today's exact placeholder strings

**Decision**: When `helpDocs === null` (Phase F never reached) or `helpDocs.description` is blank,
the render functions produce byte-identical output to today's `welcomeHtm(displayName)` /
`readmeHtm(displayName)` / the scaffolder's bare `# ${displayName}` / `<?php /* ... help */ ?>`.

**Rationale**: FR-002 requires no build failure and no blank file on an early download; matching
the existing strings exactly means every current test asserting on today's placeholder text
(`ensurePackageFiles.test.ts`, scaffolder stub tests) keeps passing unmodified, and there is no
behavior change on the "author never reached Phase F" path — only on the path where real answers
exist.

## D-05: FR-013 merge needs the base's docs fetched first — they currently never are

**Decision**: Extend `fetchKeyboardSourceToVfs` (`packages/engine/src/loader/`) to best-effort-fetch
the base keyboard's own `source/welcome.htm` and `source/help/<id>.php`, mirroring the existing
`baseLicenseText` fetch exactly: fetched from the keyboard's root/source path, non-fatal on a
missing file (same "optional sibling" tolerance already used for fonts/`.kvks`), and returned as
new result fields (`baseWelcomeHtmText?`, `baseHelpPhpText?`) rather than written straight into the
VFS — because the VFS path is where the *rendered* (merged) file belongs, not the base's raw copy.
`workingCopyStore` gains `baseWelcomeHtmText: string | null` / `baseHelpPhpText: string | null`,
set alongside `baseLicenseText` at instantiation. The render step appends newly-answered sections
below the preserved original body under a clearly delineated heading (e.g. an
`<!-- Keyboard Studio additions -->` boundary comment plus a visible subheading), rather than
interleaving into the original prose.

**Rationale**: Traced `ensurePackageFiles.ts`'s own comment ("Track 2 ... starts from a fetched
`.kmn` plus the sibling assets the header references, and the loader deliberately declines to fetch
the base's own docs") against `fetchKeyboardSourceToVfs.ts` directly: confirmed it fetches only the
`.kmn`, its header-declared sibling stores, and `LICENSE.md` — never `welcome.htm`/`help/<id>.php`.
FR-013 is unimplementable without first closing this gap; there is nothing to merge with if the
base's original text never enters the working copy. `baseLicenseText` is the exact precedent for
"fetch a base file for merge purposes without writing it into the authoring VFS."

**Alternatives considered**: Write the base's original docs straight into `clonedVfs` at fetch time,
then have the render step read-modify-write them in place — rejected, `baseLicenseText`'s existing
pattern (fetch as a side-channel field, merge only at output projection time) already solves this
and keeps the authoring-time VFS free of a file nothing has rendered yet (Constitution Article V).

## D-06: FR-012 project link lands on `.kps`'s `<WebSite>` element

**Decision**: `PackageDescriptorIdentity` (`packages/engine/src/package-descriptor/build.ts`) gains
an optional `websiteUrl?: string`; `buildKpsContent` emits `<WebSite URL="<url>"><url></WebSite>`
inside `<Info>` when present, omitted otherwise. Only the **home-page** line of `pf_project_url`'s
answer feeds this field. A second "help page" line (when the author gives both, one per line) feeds
only the README `Links` section (FR-004) — never `.kps`.

**Rationale**: Sampled `<WebSite>` usage directly in the `../keyboards` corpus
(`release/a/akan/source/akan.kps`): `<WebSite URL="https://...">https://...</WebSite>`, one element,
URL duplicated as both the attribute and the text content. Checked for any corpus `.kps` with two
`<WebSite>` elements — none found — so there is no existing convention for representing a second
link in package metadata, and FR-012 itself only requires recording "a project link" (singular),
never both.

**Alternatives considered**: Emit the help URL as a second `<WebSite>` — rejected, no corpus
precedent and the compiler's tolerance for a repeated element is unverified; safer to follow the
one convention that is already empirically in use across 250+ shipped keyboards.

## D-07: HTML escaping reuses the existing single escaper

**Decision**: Every `.htm`/`.php` render path routes free-text answers through the existing
`packages/engine/src/shared/escapeHtml.ts` (already used for the current placeholder text and the
`.kps` descriptor fields). `README.md` is Markdown — no HTML escaping applied there, since FR-009
scopes the well-formedness requirement to `.htm`/`.php` outputs only.

**Rationale**: One escaper already exists and is exercised by existing tests; a second escaping
utility would be exactly the kind of duplicated-mechanism drift the codebase's single-writer
conventions (descriptor, LICENSE) already guard against elsewhere.

## D-08: Story 2 preview is a synchronous derivation, not a second debounce cycle

**Decision**: New `packages/studio/src/hooks/useDocsPreview.ts` calls the same
`helpDocsRender.ts` functions synchronously off `useWorkingCopyStore` state (`helpDocs`, `identity`,
`attribution`, `baseWelcomeHtmText`, `baseHelpPhpText`) on every render — no `useEffect`, no timer.
Rendered by a new `DocsPreviewPanel.tsx`, following the existing Stage/overlay *pattern* used by
`usePreviewArtifact`/`OSKFrame`/`PreviewPaneOverlay` for "show live derived state," but without
adopting their async compile-`Stage` machinery, since docs rendering is a pure, synchronous string
transform with no compiler round-trip.

**Rationale**: Constitution Article IV fixes the one 300ms debounce cycle to the TS-check/WASM-oracle
validation pair (decision D3); a plan MUST NOT introduce a second timer. Docs rendering has no
async step to debounce — it recomputes on every store change exactly like any other derived-state
selector already does elsewhere in the SPA (e.g. `formatCoverageBannerParts`), so no debounce is
needed at all, and none is added.

**Alternatives considered**: Wire the preview through `useKeyboardArtifact`'s `Stage` machinery —
rejected, that machinery exists for the async compiler round-trip; forcing a pure string transform
through it would add complexity (stage transitions, retry) with no corresponding async work to
justify it.

## D-09: `docs/keyboard-documentation-plan.md` ships on this branch

**Decision**: The file exists only on the unmerged `km/keyboard-documentation-plan` branch (commit
`85bab7e7`). Since `spec.md`'s Governing Context cites it as already-authoritative content
requirements this feature "does not re-derive," and its write-order guidance is the direct basis for
`helpDocsRender.ts`'s section layout, this plan brings the file onto `061-help-docs-generation` as a
Setup-phase task (content only — the file makes no code claims that need reconciling with this
branch's state).

**Rationale**: Avoids the spec citing a document reviewers on this branch cannot see, and avoids
this feature quietly re-deriving requirements that already have a home.

## D-10: Opt-in battery section order and headings (FR-011/FR-014)

**Decision**: Fixed heading/order convention for the eleven opt-in fields, applied identically to
`welcome.htm` and `help/<id>.php` via the shared `buildDocSections` (D-02): Design Rationale →
Font Guidance → Canonical Order → Script Glossary → Example Words → Scope & Variety → Provenance →
Troubleshooting → Known Limitations → Related Keyboards → Further Reading. Each renders only when
its answer is non-blank; the whole "Additional Detail" grouping heading is itself omitted when
every opt-in answer is blank.

**Rationale**: Neither `spec.md` nor `docs/keyboard-documentation-plan.md` (which predates the
opt-in battery) specifies an order; the survey's own routing order (`pf_font_guidance` →
`pf_scope_variety` → `pf_provenance_basis` → `pf_design_rationale` → conditionally
`pf_canonical_order`/`pf_script_glossary` → `pf_example_words` → `pf_troubleshooting` →
`pf_related_keyboards` → `pf_known_limitations` → `pf_further_reading`) is a question-*flow* order
tuned for authoring ergonomics, not a reading order for an end user; this decision instead groups
by reader-relevance (why/how it's designed, before troubleshooting, before "see also") — a
one-time content decision, not a schema commitment, so it may be revisited by content-team review
without a spec amendment.

## D-11: `pf_usage_tip_3`/`_4`/`_5` are demoted — wire what is actually reachable

**Decision**: `HelpDocsAnswers.usageTips` is a plain `string[]`, populated from whichever
`pf_usage_tip_*` answers the *live* flow actually reaches. Per `registry.f.ts`/
`phaseFDemotion.test.ts`, only `pf_usage_tip_1` and `pf_usage_tip_2` are reachable today (`_3`/`_4`/
`_5` are registered but excluded from `content/flows/phase_f_helpdocs.modular.yaml`'s membership).

**Rationale**: The spec's own acceptance scenarios only ever exercise "one usage tip"; an array
shape covers however many are reachable today without special-casing a count, and needs no change
if `_3`–`_5` are ever promoted later.
