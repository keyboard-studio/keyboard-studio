# Research: Documentation completeness (spec 076)

**Date**: 2026-09-10 | **Input**: [spec.md](spec.md) | **Feeds**: [plan.md](plan.md)

All unknowns from the Technical Context resolved below. Each decision records what was
chosen, why, and what was rejected. Codebase facts were verified against the working
tree at branch `076-documentation-completeness` (commit `fee0e529`).

---

## R1. Layout chart format: SVG, not PNG

**Decision**: Generated layout charts are deterministic SVG text files, one per
(platform, layer) pair, written into `source/welcome/` and listed in the `.kps`.

**Rationale**:

- **Determinism (FR-014)**: SVG is text emitted by a pure function — byte-identical
  output is a string-equality test. Rasterizing to PNG in the studio requires canvas,
  whose output bytes vary across browsers, GPUs, and font stacks; a pure-TS PNG
  encoder would additionally need a font rasterizer to draw key labels, which is a
  project in itself.
- **The managed-PR path drops binaries**: `publishManagedPR` submits only entries with
  `typeof content === "string"` (`packages/engine/src/output/managed-pr.ts:119-122`).
  PNG charts would silently vanish from the primary community-submission path — an
  outage of FR-013 on Option B. SVG rides the existing text path unchanged.
- **No image infrastructure exists**: a repo-wide sweep found zero SVG/PNG/canvas
  generation in `packages/engine`; the engine's only binary handling is pass-through
  (fonts, `.ico`). SVG generation is string templating — the smallest greenfield.
- **Rendering support**: the Keyman welcome viewer is an embedded HTML view; SVG via
  `<img>` renders on every engine Keyman supports (IE9+/WebView/WebKit). The `.kps`
  `<FileType>` mechanism is extension-agnostic.

**Alternatives considered**:

- *PNG via canvas at production time* — rejected: non-deterministic bytes (breaks
  FR-014/SC-004), binary (dropped by managed PR), requires the DOM at projection time
  (projection currently runs in tests under node).
- *PNG via pure-TS encoder* — rejected: deterministic but requires glyph rasterization
  for key labels; enormous scope for no user-visible gain.
- *Matching the corpus's dominant format (PNG, 2715 of ~3300 corpus welcome images)* —
  rejected: corpus images are hand-drawn screenshots; nothing upstream requires PNG,
  and `.kps` `<File>` entries carry any extension.

**Risk noted**: very old Keyman Desktop welcome renderers (pre-IE9 era) may not render
SVG in `<img>`. Accepted: those versions predate every supported target.

## R2. Chart renderer: new pure engine module fed by contracts types

**Decision**: New module `packages/engine/src/layout-chart/` exporting
`renderLayoutCharts(input): LayoutChartFile[]` — a pure, deterministic function over
contracts types only. Touch layers render from `TouchLayoutIR` (the only
geometry-bearing model: `TouchKeyIR.width/pad/sp`, `computeRowMetrics` from
`packages/contracts/src/row-metrics.ts`). Desktop layers render from `KvksIR`
(`packages/contracts/src/keyboard-ir.ts:422`) when present, else from `KeyboardIR`
rule outputs projected onto the standard US physical grid via the existing accessors
(`buildComboKeyMap`, `collectLayerCombosInUse`, exported at
`packages/engine/src/index.ts:540`).

**Rationale**: `KvksIR` has labels but no geometry, so a fixed physical-grid geometry
table (ISO/ANSI 101-key rows) lives in the renderer — the same simplification every
hand-drawn corpus chart makes. Touch geometry is fully declared in the model
(spec 063's rule: declared width/pad, never rendered width). The renderer must live in
the engine, not the studio: documentation generation is engine-owned (spec §12) and
the projection seam that consumes it (`serializeWorkingCopy.ts` step 5c) already calls
engine renderers. The studio's `buildKeyGridViewModel`
(`packages/studio/src/editors/assignLoop/keyGrid/keyGridViewModel.ts:424`) is the
structural precedent (pure projection, per-layer, RTL-aware) but is studio-internal
and DOM-oriented; the engine renderer copies its shape, not its code.

**Legibility rules (FR-016)**: combining marks (Unicode categories Mn/Mc/Me) render on
a U+25CC dotted-circle carrier; characters outside the chart font stack's declared
coverage render as their `U+XXXX` scalar name in a smaller monospace face; keys with
no output on a layer render with a visually distinct (hatched/dimmed) keycap. Since
SVG text rendering falls to the viewer's fonts, "no available glyph" is approximated
by script-block heuristics only where cheap; the dotted-circle and empty-key rules are
exact. Chart `<text>` elements always carry a generic fallback stack.

**Naming (FR-015)**: `ks-layout-<platform>-<layer>.svg`, e.g.
`ks-layout-desktop-shift.svg`, `ks-layout-phone-default.svg`. The reserved `ks-layout-`
prefix cannot collide with hand-authored base images (free-form names; corpus survey
found none using this prefix). Layer ids are sanitized to `[a-z0-9_-]` with a
deterministic escape for anything else.

**Alternatives considered**: screenshotting the OSK iframe (`OSKFrame.tsx` +
KeymanWeb) — **forbidden by product-owner decision** and non-deterministic; reusing
`KeyGrid` DOM + `foreignObject` — ties engine output to studio DOM, untestable in
node.

## R3. Welcome folder convention: migrate all three hard-coded sites together

**Decision**: The welcome page moves to `source/welcome/welcome.htm` at every layer in
one coordinated change:

1. **Projection write** — `serializeWorkingCopy.ts:455` writes
   `source/welcome/welcome.htm`; chart files and inherited images are written beside
   it. No `source/welcome.htm` is ever written (FR-002).
2. **Descriptor** — `buildKpsContent` (`package-descriptor/build.ts:125,152`) lists
   `welcome\welcome.htm` plus every file in `source/welcome/` in `<Files>`, and names
   `<WelcomeFile>welcome\welcome.htm</WelcomeFile>` (matches corpus form, e.g.
   `ahom_star.kps`). `applyIdentityToKps` (`patch.ts`) gains a welcome-path migration
   for the copy track's pre-existing `.kps` — the one exception to its
   "never touch `<Options>`/`<Files>`" rule, since FR-002 makes the flat name a defect.
3. **Loader fetch** — `fetchKeyboardSourceToVfs.ts:410` becomes a three-step probe per
   the spec assumption: descriptor-named welcome file first (the `.kps` is already
   fetched and parsed at `:231`), then `source/welcome/welcome.htm`, then flat
   `source/welcome.htm`. When the folder convention is found, every `welcome/` file
   named in the `.kps` `<Files>` list is fetched too (images binary, page text) —
   `parseKpsFiles` (`base-browser/kps-parser.ts:165`) provides the manifest. Missing
   listed files are skipped and recorded (edge case: descriptor names a ghost file).
4. **Scaffolder stub** — `scaffolder/index.ts:563` writes the folder path. The rename
   pass (`:158-168`) already deliberately skips subdirectory files — no change needed.
5. **kmp member resolution** — `kmpPaths.ts` `resolveFilename` handles relative names;
   add test coverage for the `welcome\welcome.htm` backslash form.

**Rationale**: the explorer sweep confirmed the flat path is encoded in exactly these
places, plus tests that pin it. The corpus majority (728 of 1026) uses the folder
form; the descriptor names it with a backslash-relative `welcome\welcome.htm`, so
output must emit that form for corpus conformance.

**Alternatives considered**: supporting both conventions in output — rejected by
FR-002 (flat file MUST NOT appear in output); migrating the loader only — rejected,
the descriptor and projection would then disagree and `buildKmp` fails with
`KM_ERROR_KMP_FILE_MISSING` when `<Files>` and the VFS diverge (`kmp.ts:632`).

## R4. Base documentation profile: classify from the already-fetched `.kps` + one probe fetch

**Decision**: `classifyBaseDocumentation` is a pure engine function over (a) the
base's parsed `.kps` `<Files>` manifest and (b) the base welcome/help texts when
available. Classification: **none** = no doc member beyond LICENSE in the manifest;
**minimal** = members present but welcome/help bodies are stubs (below the
usable-description threshold in the spec assumption); **full** = a usable description
exists. It is computed at base *selection* time for the selected/highlighted base
only, from files the loader path already touches: the `.kps` is fetched per-base by
the base browser (`base-browser.ts:184-185`), and one welcome-page probe fetch is
added for the candidate the author focuses. A base whose profile has not been computed
shows **unknown**, never "none" (spec assumption).

**Rationale**: the base browser discards the full release-tree file listing
(`base-browser.ts:161-165`) and precomputing 1026 profiles per session is exactly the
"unless cheap" cost the spec assumption warns about. The `.kps` manifest is already in
hand and answers membership; only stub-vs-full needs one text fetch, done lazily and
cached on the `BaseKeyboard` carrier.

**Alternatives considered**: a build-time facet in `docs/keyboard-facet-index.json`
(the facet pipeline exists and is the long-term home) — deferred, not rejected: it
requires a corpus-index rebuild cycle owned by a different toolchain, and FR-008 only
needs the selected base. The design keeps `classifyBaseDocumentation` pure so a facet
build can reuse it later. Full-gallery classification — rejected for v1 cost.

## R5. Source-tier record (FR-022): pure derivation + persisted author state

**Decision**: A pure engine function `deriveDocMemberStates(input): DocMemberState[]`
is the single source of truth for the six members' `{path, tier, placeholder}`. Inputs
are exactly the working-copy slices that already exist (`helpDocs`,
`baseWelcomeHtmText`/`baseHelpPhpText` and the new base doc fields,
`instantiationMode`, version/identity) plus two new persisted slices:
`historyEntryState` (the proposal's confirmed/edited/dismissed state, R6) and
`chartPreference` (keep-base-images vs regenerate, R2/FR-015). The studio memoizes the
derivation; the Output checklist, the upstream-finding classifier (R8), and
persistence all read the derived record. Nothing re-derives tier logic locally.

**Rationale**: tier is a deterministic function of state the store already holds —
duplicating it as a manually-maintained parallel record invites drift (the same reason
`spec-061` made welcome/help parity structural rather than compared). The two genuinely
new facts (HISTORY confirmation state, chart regeneration choice) are author decisions,
so they are store state, persisted via `persistWorkingCopy.ts` like `helpDocs`.

**Alternatives considered**: a written-through `docProvenance` store map updated by
every content-changing action — rejected: every writer must remember to update it
(N update sites vs 1 derivation), and a missed site silently lies to FR-020.

## R6. HISTORY proposal: derive from the decision record, surface as a Phase F screen

**Decision**: `buildHistoryProposal(snapshot, base, version, date)` is a pure engine
function over the existing decision-audit record
(`snapshotDecisionRecord()`, `packages/studio/src/decisions/decisionLogStore.ts:401`;
`EditorActionSummary` counts, `recordBaseContribution` baseline) producing
`{heading, bullets[]}` in the `## <version> (<YYYY-MM-DD>)` + bullets format criteria
3.5 requires. The author surface is a new Phase F flow screen (`pf_history_entry`,
propose-then-confirm per §3c) between the description and the opt-in gate; the Output
checklist's HISTORY row links back to it. Confirmation state lives in the new
`historyEntryState` store slice: `proposed | confirmed | edited | dismissed`, with the
bullets text. At projection, a new `renderHistoryMd` seam applies the confirmed entry
as the top section — Track 1 replaces the `Initial release.` stub body under the same
heading; Track 2 becomes the entry `stageAdaptHistory`
(`engine/src/output/adapt-staging.ts:96`) prepends, preserving base entries below
(criterion 3.4). The `Adapted from` bullet is injected unconditionally on adaptations
(criterion 19.2, existing scaffolder-bake band) regardless of author edits (FR-012).
A version change after confirmation re-derives the heading and keeps confirmed bullets
(spec edge case).

**Rationale**: the decision record already captures exactly the seeds FR-010 names —
base identity, keys added/removed, mechanisms assigned — with no new journal (spec
assumption). Phase F is where every other docs answer lives, so the proposal rides the
existing flow, `setHelpDocs`-style store write, and manifest declaration pattern.

**Alternatives considered**: proposing at the Output step only — rejected: Output is a
reporting surface; editing there would create a second docs-authoring surface outside
the manifest (Article IX friction). Free-text HISTORY editing of the whole file —
rejected: the criteria formats (3.3/3.5) are guaranteed by construction if the tool
owns the heading and the author owns bullet text.

## R7. Thirteen Layer C documentation codes in twelve check modules: pure string-level checks in keyboard-lint, wired via a memoized studio hook

**Decision**: The 13 criteria rows in FR-019 land as new pure check functions in
`packages/keyboard-lint/src/checks/docs/`, one module per row (3.6 + 7.1 share one
module emitting both codes, as the spec pairs them), each returning `LintFinding[]`
with `severity: "warning"`, a `hint`, and the `code` string-matched to the row's
existing `lintRuleId` — **no criteria.json edits are needed**; all 13 rows already
carry populated `lintRuleId`s (verified: `criteria.json:164-787`). A new bijection
test asserts every FR-019 `lintRuleId` has an emitting check, closing the known
"nothing enforces code↔criterion" gap.

Checks take plain data (member texts, kmn version, targets, layer ids), not the VFS or
engine types, keeping keyboard-lint contracts-only (dep-cruiser rule
`lint-not-to-engine`). A `collectDocLintInput` helper on the studio side assembles the
input from the same rendered content the docs preview already computes
(`useDocsPreview`) plus VFS reads for HISTORY/LICENSE/README.

**Runtime wiring**: keyboard-lint has **no runtime invocation today**
(`KeyboardLintEngine` is never constructed; `validateWithOracle` takes a string). The
doc checks follow the `useTouchKeyDiagnostics` precedent
(`useValidatorFindings.ts:127-138`): a synchronous pure compute wrapped in `useMemo`
keyed on the working-copy inputs, concatenated into the same findings array
`StudioShell.tsx:1202` consumes. **No new timer** — this satisfies FR-019 and D3; the
memo re-evaluates when its inputs change, which happens within the existing render
cycle. Where spec.md self-contradicts on Layer C cadence (§ table "per-phase-exit +
at submit" at spec.md:576 vs "every 300 ms cycle" at :649), FR-019's own wording
("inside the existing validation cycle, not on a new timer") is adopted: recompute on
input change inside the existing cycle, no independent scheduler.

**11.5 well-formedness without DOMParser**: the criterion text says "in-browser check
via DOMParser", but keyboard-lint is DOM-free and node-tested. Decision: a small
dependency-free tag-balance scanner (void-element aware, case-insensitive) implements
11.5; the check-module header documents the deviation from the criterion's suggested
mechanism (the criterion binds the *fact* checked, not the API). This keeps the
package node-testable and the check deterministic across environments.

**Hints**: English prose in `hint`, matching every existing Layer C check; the
structured-finding i18n redesign (`touch-key-diagnostics.ts:34` precedent) is out of
scope and noted as a known boundary.

**Alternatives considered**: running checks inside `lintWithContext` against the VFS —
deferred: the projected doc members don't exist in the working VFS until production
(step 5c renders on the fly), so VFS-reading checks would validate stale or absent
content; string-input checks validate exactly what will ship. DOMParser with jsdom
test env — rejected: adds a browser dependency to a deliberately node-clean package.

## R8. Upstream-finding classification (FR-020): build the missing producer from base baselines

**Decision**: `origin: "upstream"` has consumers (`LintChip.tsx:73` muting,
`completeness.ts:325` threshold exclusion) but **no producer anywhere** — the
classification half is net-new. Design: run the same doc checks once against the
*base's own* member texts (already fetched by the loader: welcome, help, LICENSE; the
loader additionally fetches base `README.md` and `HISTORY.md` for FR-006 inheritance,
which supplies the rest). A finding on the current content is classified `upstream`
when (a) the same `code` was present in the base-baseline findings for that member and
(b) the member's tier (R5) is still `inherited` — i.e. the author has not touched it.
Baseline findings are computed once per instantiation and cached on the store.
Additionally, `LintSummary`'s severity counts and live-region text exclude upstream
findings from the headline count (they render muted in the list), fixing the "12 muted
findings still announce as 12 warnings" inconsistency the sweep found.

**Alternatives considered**: byte-diffing member content against a pristine base
snapshot to detect "touched" — rejected: the tier record (R5) already encodes it, and
FR-022 explicitly wants one source of truth.

## R9. Track 1 copy inheritance: images and skeleton, never prose

**Decision**: The loader's doc-fetch bundle (welcome text + folder images + help text
+ README/HISTORY texts) is threaded through the Track 1 path the way `baseLicenseText`
already is (`scaffolder/index.ts:784-786` precedent). On copy, only the image files
and the welcome page's *structure* are used: images are carried into
`source/welcome/`, and the fresh welcome page (`buildFreshHtmlDoc` branch) gains a
"Keyboard Layout" section referencing them. `baseWelcomeHtmText`/`baseHelpPhpText`
stay null on Track 1 so no merge occurs and no base prose can leak (FR-007) —
enforced by a test asserting no base prose sentence appears in Track 1 output.

**Rationale**: Track 1 currently fetches no base docs at all (the fetch runs only on
the open-base branch, `useKeyboardArtifact.ts:742-748`); the smallest compliant change
reuses the existing fetch and gates *what* is consumed by track, in one place.

## R10. Output checklist: informational component on OutputScreen, existing nav affordances

**Decision**: A `DocumentationChecklist` component renders on `OutputScreen.tsx`
between the download buttons and `ManagedPRSubmitPanel`: six rows from
`deriveDocMemberStates` (R5), each showing member name, tier label
(derived/inherited/authored), and a placeholder marker; placeholder rows carry a
"Go to …" action using the existing back-navigation affordances
(`backToUnfinishedGallery`-style store actions + `navigateTo("survey")` for Phase F;
never `advance()` — the P0 regression at `surveySessionStore.ts:446-457`). The
checklist touches neither `canDownload` (`usePreviewArtifact.ts:324`) nor
`submitEnabled` (`ManagedPRSubmitPanel.tsx:245`) — FR-018's never-block is enforced
by *not wiring* it into any gate, plus a regression test that downloads/submits with
all rows on placeholder. Missing-image warnings (edge case) surface as checklist row
annotations sourced from projection warnings.

**Structural precedent**: `RemovalBanner.tsx` disclosure checklist and
`DocsPreviewPanel.tsx` (which already computes rendered members and moves naturally
toward Output-step reuse).

## R11. Survey-surface declarations (FR-021 / Article IX)

**Decision**: New surfaces and their manifest treatment:

| Surface | Kind | Declaration |
|---|---|---|
| Base doc classification | display-only addition to existing `choose_base` editor step | `specRef` extended; no new writes (reads base metadata only) |
| Adaptive description proposal | behavior of existing `pf_welcome_paragraph` question (prefill + conditional `required`) | question module updated; writes unchanged (`setHelpDocs` path) |
| HISTORY proposal | new Phase F question `pf_history_entry` in `phase_f_helpdocs` flow | new question module + registry entry + flow YAML id; writes to the `historyEntryState` store slice |
| Output documentation checklist | addition to existing Output editor step | `specRef` extended; placeholder-row nav uses existing store actions |
| Layout-chart preference (keep base images / regenerate, FR-015) | control on the checklist's welcome row, same Output editor step | covered by the same `specRef` extension; writes the `chartPreference` store slice via `setChartPreference` (not an IR write) |

Docs answers are not IR writes — they follow the established spec-061 pattern
(store slice → projection-time render), so the `mutate()` seam is not involved; the
seam applies to IR paths only (Article IX's "every IR write"). This is stated in the
plan's Constitution Check to make the reading explicit.

## R12. Determinism boundary for SC-004

**Decision**: All six members plus charts must be byte-identical across productions of
an unchanged keyboard. Two existing nondeterminism sources are handled: the HISTORY
date and LICENSE year already flow from injected clock parameters
(`generateStubs(emitYear)`, `stageAdaptHistory(dateIso)`) — the HISTORY proposal
heading date follows the same injected-date convention (stored at confirmation time,
not re-stamped per production). Chart SVG emission sorts all iteration
(layers in model order, attributes in fixed order, numbers formatted with a fixed
precision helper) and embeds no timestamps. A round-trip test produces twice and
compares bytes (SC-004).

## R13. Corpus sweep for SC-002

**Decision**: SC-002 ("all 728 folder-convention bases preserve welcome + images") is
verified by an offline node script under `utilities/` (the standalone-utilities
convention — outside `pnpm -r`), sweeping `../keyboards` release tree: for each base
with `source/welcome/`, run the loader's welcome-resolution + descriptor-projection
logic and assert every image is carried and listed. It runs on demand (documented in
quickstart.md), not in CI's default lane — the corpus checkout is a sibling-repo
dependency CI already treats specially (facet-index builds).
