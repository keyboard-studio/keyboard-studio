# Feature Specification: HTML editor step — Documentation with file selector + WYSIWYG

**Feature Branch**: `km/html-docs-wysiwyg`

**Created**: 2026-11-03 (as-built spec); **revised**: 2026-11-06 (this scope)

**Status**: Spec — rebuild of the shipped step

**Owner**: Studio team

**Base**: `origin/main` fdff081a (Merge PR #2560)

## Purpose

The author edits the keyboard's user documentation as real files, in a
WYSIWYG editor, and the edits survive into the downloaded package. The step
covers every documentation member — not just `welcome.htm` — with a file
selector, per-file seeding, and authored overrides that beat regeneration
downstream.

## Ruling (Matthew, 2026-11-06)

Doc exports ARE generated, but the Documentation step is the LAST opportunity
to edit them on the copy track (Track 1, `new-from-base`) and the MAIN
opportunity on the open track (Track 2, `adapt-existing`, and the Open walk).
The step edits the generated files as they stand at that point; author edits
override generation downstream. This overturns the Nov 3 generated-exports
ruling **only as a bar on editing** — generation itself stays: untouched
files keep exactly their current generated/carried behavior.

## Diagnosis — re-verified on fdff081a (2026-11-06)

Every item below was re-checked against the base; the Nov 6 diagnosis stands
unchanged, with two additions (Open walk, fallbackPolicy status).

- `packages/studio/src/editors/assignLoop/HtmlEditor.tsx` — no file selector;
  Monaco only (`HtmlCodePane`, lazy-loaded); no WYSIWYG; editor state starts
  `useState("")` and is **never seeded** from `startWelcomeHtmText` (or
  anything else); the preview renders raw HTML via `dangerouslySetInnerHTML`;
  `onComplete({ html })` fires on Continue. Footer nav already publishes via
  `usePublishStepNav` (keep). Its header comment still frames `readme.htm` /
  `README.md` / `.php` as generated exports the editor does not touch.
- `packages/studio/src/survey/questions/gallery/welcomeHtm.ts` — the
  `welcomeHtm` gallery module is a stub: `writes: []`,
  `apply: () => ({})`, `UnmigratedGalleryRenderer`, `provides:
  ["welcome-htm"]`, `requires: ["help-docs"]`, `screen: "html"`. The
  `{ html }` from `onComplete` is recorded nowhere — edits are silently
  discarded. Its doc comment also still calls welcome.htm "Markdown source".
- `packages/studio/src/stores/workingCopyStore.ts` — there is **no
  authored-HTML field**. The `customCss` pattern is the model to mirror:
  field `customCss: string | null` (line 823), setter `setCustomCss`
  (lines 1139, 2365, "null = untouched, '' = cleared"), persistence in
  `packages/studio/src/lib/persistWorkingCopy.ts` (snapshot line 439,
  restore line 620, tolerant `?? null` for pre-existing drafts), projection
  via `applyCustomCssToVfs` in `packages/studio/src/lib/customCss.ts`,
  called from `projectWorkingCopyVfs` step 0b
  (`packages/studio/src/lib/projectWorkingCopyVfs.ts:595`). `CssEditor.tsx:82`
  calls `setCustomCss` directly — the editor writes the store, it does not
  rely on `onComplete`.
- `packages/studio/src/lib/serializeWorkingCopy.ts` — step 5c regenerates
  unconditionally on non-Open runs: `README.md` and `source/readme.htm`
  (lines 739–740, `renderReadmeMd` / `renderReadmeHtm`); the welcome page
  (line 751, `renderWelcomeHtm(docsInput, inheritedWelcomeHtmText,
  welcomeFolderFiles, inheritedHelpPhpText)`); the help page (line 779,
  `renderHelpPhp(docsInput, inheritedHelpPhpText, inheritedWelcomeHtmText)`).
  `HISTORY.md` is rendered on every production (lines 822–833,
  `renderHistoryMd`, adapt carries `startHistoryMdText` below the new entry);
  `LICENSE.md` is write-if-absent on adapt from `startLicenseText`
  (lines 860–871). `inheritedWelcomeHtmText` / `inheritedHelpPhpText` are the
  `start*` slices on adapt only, null on copy (lines 406–407). The flat
  `source/welcome.htm` is deleted on non-Open runs (spec 079 FR-002).
  The Open path (`isOpen`, line 401 via `isOpenedWithDescriptor`) skips all
  regeneration and carries the slices verbatim (`carryIfAbsent`, ~lines
  877–890).
- Lockfile: **no rich-text dependency exists** — no `tiptap`, `milkdown`,
  `lexical`, `quill`, `slate`, or `prosemirror` in `pnpm-lock.yaml`,
  `package.json`, or `packages/studio/package.json`.
- `packages/studio/src/steps/registerEditorSteps.ts:395–396` — stale comment:
  "edits the keyboard's `welcome.htm` documentation file (Markdown despite
  the extension)". The `.htm` files are HTML, not Markdown (verified
  2026-11-03 across keymanapp/keyboards: `akan`, `basic_kbdus`,
  `khmer_angkor` all start with `<!DOCTYPE html>`).
- Start slices already in the store (fetch-don't-write, all `string | null`):
  `startWelcomeHtmText` (line 510), `startHelpPhpText` (line 516),
  `startReadmeMdText` (line 540), `startHistoryMdText` (line 546),
  `startLicenseText` (line 487), `startDocCssTexts`, `startWelcomeConvention`
  (line 579). `baseHelpPhpTextForExtraction` is extraction-only for issue
  #2206 — **never a seed** (it exists on Track 1 precisely so no prose is
  inherited there).
- The `html` step IS walked on the Open walk:
  `WALKED_ON_OPEN_BY_GATE` includes `"html"`
  (`packages/studio/src/steps/advance.ts:98`). The seeding matrix below
  therefore has three modes, not two.
- `packages/studio/src/test/headlessAuthor/stepDrivers/welcomeHtm.ts` —
  current driver is `html: () => ({ html: "" })`, "continue with empty
  markdown" (stale comment; it is HTML, and empty is the scaffold default).
  `packages/studio/src/test/journey-runner.ts:858` has the same
  `case "html": { result = { html: "" }; }`.
- FallbackPolicy precedent (PR #2549) is **not on this base**:
  `packages/studio/src/lib/fallbackPolicyStepCompletion.ts` and
  `packages/studio/src/test/headlessAuthor/stepDrivers/fallbackPolicy.ts`
  do not exist at fdff081a, and `driftGuard.ts` INVENTORY has no
  `completeFallbackPolicyStep` entry. Use the OSK precedent instead
  (`lib/oskStepCompletion.ts`, `driftGuard.ts:57` `completeOskStep` entry,
  `stepDrivers/osk.ts`); re-check #2549's landing state at implementation
  time.

## Decisions (Matthew, 2026-11-03 — retained)

- Placement is after the documentation questions, before the package step
  (`help` → `html` → `icon` → done/output; `advance.ts:375–379`).
- The `.htm` files are **HTML**, not Markdown. The editor is HTML-mode, not
  Markdown-mode.

## File inventory

The member set is the same six members as
`packages/studio/src/components/DocumentationChecklist.tsx`
(`readme-md`, `history-md`, `license-md`, `readme-htm`, `welcome-htm`,
`help-php`; mapping at lines 45–48, rendering at 114–124). VFS paths, from
the actual projection (`serializeWorkingCopy.ts`, `welcomeFolder.ts:31–35`):

| Member | VFS path | Editable in this step |
|---|---|---|
| `welcome-htm` | `source/welcome/welcome.htm` (flat `source/welcome.htm` on pre-folder-convention bases, per `startWelcomeConvention`; `WELCOME_PAGE_PATH` / `FLAT_WELCOME_PATH`) | Yes — WYSIWYG + code |
| `readme-htm` | `source/readme.htm` | Yes — WYSIWYG + code |
| `readme-md` | `README.md` | Yes — WYSIWYG (Markdown) + code |
| `help-php` | `source/help/<keyboardId>.php` (`resolvedKeyboardId`) | Yes — body WYSIWYG + code (see .php decision) |
| `history-md` | `HISTORY.md` | No — read-only (see below) |
| `license-md` | `LICENSE.md` | No — read-only (see below) |

An absent member must be shown as absent, never offered as a dead file.
Presence is read from the projected VFS / `useDocMemberStates` — the
selector lists what the package actually ships.

### File chooser: narrow tree on desktop, tabs on narrow (2026-11-07 follow-up)

On desktop the selector is a narrow (~240px) folder-grouped tree at the
left, sticky while the editor scrolls, with the editor + mode toggle on the
right: `source/` groups `welcome/welcome.htm`, `readme.htm`, and
`help/<keyboardId>.php`; `README.md`, `HISTORY.md`, and `LICENSE.md` list
below as root files. Each row shows the path as shipped plus the friendly
member name, the read-only badge where it applies, and the absent badge
where a member is genuinely absent. On narrow viewports (width ≤
`BREAKPOINTS.tabletMax` — a two-pane layout that needs the room, per the
`useViewport` vocabulary) the tree collapses back to the tab row. Both
render the same buttons (`data-testid="html-file-<member>"`).

### HISTORY.md / LICENSE.md presence (2026-11-07 follow-up — root cause)

On the Open track both files rendered disabled "(absent)" with an empty
preview, although the package always ships both. Root cause:
`HtmlEditor.present()` checked only the opened VFS for them, with no
fallback to the start slices — and the loader deliberately never puts
`LICENSE.md` into the VFS (it lives only in the `startLicenseText` slice;
`HISTORY.md` likewise in `startHistoryMdText`). Fixed: presence for those
two members is carried VFS text, or the start slice, or the generated
render — the last of which always holds (serialize step 5c renders
`HISTORY.md` on every production; step 5d + `ensurePackageFiles` write
`LICENSE.md` when absent), so they never render "(absent)". Their preview
falls back the same way: VFS text, then the start slice, then the
generated render, reusing the exact renderers the download uses
(`renderHistoryMd` with serialize step 5c's inputs, mirroring
`useDocumentationFindings`' version derivation; `licenseMd` with a null
holder, exactly as `ensurePackageFiles` writes it). `licenseMd` is newly
exported from `@keyboard-studio/engine` for this. Regression tests cover
both the slices-only and the nothing-carried cases on the Open track.
Layering note: the generated HISTORY preview needs the test-builds flag
for the publish version, but the step must NOT import `testingStore` —
that is a depcruise `no-circular` violation (`HtmlEditor` sits downstream
of `decisionLogStore` via the `welcomeHtm` decision renderer), so
`StepHost` passes `hasTestBuilds` down as an `EditorStepProps` prop
(absent outside StepHost — treated as false).

### HISTORY.md and LICENSE.md are read-only in this step

- `HISTORY.md` is rendered on **every** production from
  `historyEntryState` (`serializeWorkingCopy.ts:822–833`): a new entry is
  prepended each time, with the base's entries carried below on adapt.
  A free-text edit here would be overwritten by the next render, so offering
  it as editable would be a dead edit. It is shown (presence + preview) and
  edited through its owning decision, `pf_history_entry`. Matthew may
  overturn this; the implementer must not silently make it editable.
- `LICENSE.md` is renderer-owned the same way: adapt carries the base's
  text verbatim (write-if-absent, spec 064 FR-004, "no invented holder");
  copy gets a stub with the inherited holders. Shown, not edited here.

## Seeding matrix

Rule: **never a blank page on adapt or open; never another keyboard's
identity-bearing description on copy** (ruling A, 2026-10-15; spec 102
FR-032 / spec 080 FR-007).

The uniform seed rule: on copy and adapt, seed each editable file from the
live preview — `useDocsPreview()` (`packages/studio/src/hooks/useDocsPreview.ts`)
already applies the track guards and inheritance, rendering through the
same `helpDocsRender` functions the output projection calls, so the seed is
the page as it will ship. On open, seed from the carried VFS text (the
package's own file), falling back to the `start*` slice, then to the preview.

| File | Copy (`new-from-base`) | Adapt (`adapt-existing`) | Open (`isOpen`) |
|---|---|---|---|
| `welcome.htm` | `useDocsPreview().welcomeHtm` (generated; `renderWelcomeHtm` with null inherited prose) | `useDocsPreview().welcomeHtm` (includes `startWelcomeHtmText` where the base has one, else generated) | VFS `source/welcome/welcome.htm` (or flat path per `startWelcomeConvention`) via `readVfsText` (`lib/vfsText.ts`), else `startWelcomeHtmText`, else preview |
| `readme.htm` | `useDocsPreview().readmeHtm` | `useDocsPreview().readmeHtm` | VFS `source/readme.htm`, else preview |
| `README.md` | `useDocsPreview().readmeMd` | `useDocsPreview().readmeMd` (adapt keeps only the inherited description, via `buildReadmeFacts`; spec 110 FR-011) | VFS `README.md`, else `startReadmeMdText`, else preview |
| help `.php` | `useDocsPreview().helpPhp` (fresh help-site header + body) | `useDocsPreview().helpPhp` (inherited page where one exists, else derived from welcome) | VFS `source/help/<id>.php`, else `startHelpPhpText`, else preview |

Switching files in the selector re-seeds from the same rule; switching back
to a file the author already edited shows the author's edited text, never
the seed again. The editor must not clobber an in-progress edit on
re-mount (same discipline as the Phase E touch draft).

## Persistence design

Authored per-file overrides in the working-copy store, mirroring the
`customCss` pattern exactly — one nullable string field + setter per
editable file (`null` = untouched, `""` = cleared, same convention as
`customCss`):

- `authoredWelcomeHtm: string | null` + `setAuthoredWelcomeHtm`
- `authoredReadmeHtm: string | null` + `setAuthoredReadmeHtm`
- `authoredReadmeMd: string | null` + `setAuthoredReadmeMd`
- `authoredHelpPhp: string | null` + `setAuthoredHelpPhp`

Persisted via `persistWorkingCopy.ts` snapshot/restore with the tolerant
`?? null` idiom for drafts saved before the fields existed (cf. `customCss`,
lines 439/620). Registered in `decisions/derivedSurfaceRegistry.ts` the
way `setCustomCss` is (storeActions line 352, action kind line 465).

The override is applied at every point the generated text is produced, by
one shared helper (e.g. `resolveDocMemberText(member, generated, authored)`
in `packages/studio/src/lib/`), preferring the authored override for a
touched file over regeneration:

1. `projectWorkingCopyVfs` step 0b — alongside `applyCustomCssToVfs`
   (`projectWorkingCopyVfs.ts:595`). This is the single upstream point:
   `serializeWorkingCopy` calls `projectWorkingCopyVfs` (line 565), so the
   projected VFS the zip starts from carries the override.
2. `serializeWorkingCopy` step 5c — after the regeneration at lines
   739/751/779, because 5c runs after the `projectWorkingCopyVfs` call and
   would otherwise overwrite the override with a fresh render.
3. `useDocsPreview` — the live preview shows the authored text for a
   touched member, so preview cannot disagree with the produced package
   (spec 061 FR-005/FR-010).

Untouched files keep exactly their current generated/carried behavior at
all three points. The `welcomeHtm` gallery module becomes a real recorded
decision: `writes` names the members it records, `apply` stores the
authored values, and the `UnmigratedGalleryRenderer` is replaced (follow
the OSK precedent: `lib/oskStepCompletion.ts` + `driftGuard.ts` INVENTORY
entry + headless-author step driver). The other members' `provides` stay
with their owning modules unless the implementer shows they belong here;
do not invent new decision providers silently.

## WYSIWYG choice — TipTap v3

**Pick: TipTap v3** (`@tiptap/react` + `@tiptap/pm` + `@tiptap/starter-kit`
+ `@tiptap/markdown`, all pinned in lockstep at the latest 3.x at install
time; ~3.31.x was latest seen Oct 2026). Install with
`pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/markdown`
in `packages/studio` (workspace root runs `pnpm install --frozen-lockfile`
after; do not hand-edit the lockfile).

Justification (for the PR): the artifacts being edited are HTML first —
`welcome.htm`, `readme.htm`, and the help `.php` body are HTML documents,
and only `README.md` / `HISTORY.md` are Markdown — and TipTap's document
model *is* HTML (ProseMirror DOM parse/serialize), so an edit round-trips
through the editor without a lossy Markdown intermediate, while its
official `@tiptap/markdown` package covers the `.md` files; Milkdown v7
is Markdown-first (remark-based, HTML nodes secondary), so every `.htm`
edit would pass through an HTML→Markdown→HTML round-trip that mangles the
corpus's real content — inline `<style>` blocks (90% of welcome pages),
OSK `<div id='osk' data-states='…'>` placeholders, and layout-chart
`<img>`s — and its React binding has no native `value`/`onChange` props.
Both are MIT, both sit on ProseMirror (no engine-risk difference), and
TipTap's React peer range (`^17 || ^18 || ^19`) accepts the repo's React
18.3.1 with no conflict; TipTap is the larger, faster-moving community
(Milkdown core ~261k weekly downloads, Sep 2026). The editor must be
lazy-loaded (`React.lazy`, same as the existing `HtmlCodePane`) so it never
lands in the main chunk, exactly as Monaco already is.

## .php decision

Edit the help `.php` **body as HTML in WYSIWYG; the PHP is preserved,
never edited, never mangled.**

- The leading `<?php … ?>` header block is preserved verbatim. Reuse the
  engine's existing extraction: `leadingPhpBlock` /
  `LEADING_PHP_BLOCK_RE` in `packages/engine/src/shared/helpDocsRender.ts:545`
  (currently an unexported function — export it; the regex already handles
  BOM, whitespace, and multiple leading blocks). The editor never sees the
  header; serialization re-prepends it byte-for-byte.
- Mid-body PHP is real: `basic_kbdinben`'s help page carries
  `<?php renderLanguageExamples(); ?>` at line 42 of its body (found in a
  scan of the first 200 help `.php` files under `keymanapp/keyboards`
  `release/`; `akan` and `sil_cameroon_qwerty` carry only the leading
  header). Mid-body `<?php … ?>` fragments are extracted to opaque,
  non-editable placeholder nodes in the editor and re-inserted byte-for-byte
  on save. A regression test must prove byte-identical reinsertion for a
  fixture carrying one.
- If a file's PHP cannot be round-tripped exactly, that file falls back to
  code-mode-only (Monaco) with a visible note — never a silent mangle, never
  a dropped block.
- Note the fresh-page shape the renderer emits (`renderHelpPhp`,
  `helpDocsRender.ts:886`): header + body fragment only, no
  `<html>`/`<body>` wrapper — the site's `header.php` owns the document
  chrome (criterion 11.4). The editor edits the fragment, not a document.

## Editor modes

- WYSIWYG is the primary mode for every editable file. Monaco
  syntax-highlighted code stays as a secondary mode (same toggle discipline
  as the current edit/preview/side-by-side switch), per file: HTML mode for
  `.htm` and the `.php` body, Markdown mode for `.md`.
- The current read-only HTML preview stays as a third view; it renders the
  author's own document, not untrusted content (existing comment in
  `HtmlEditor.tsx`).

## Registration checklist (verify each; paths found on fdff081a)

- [ ] Step driver: `packages/studio/src/test/headlessAuthor/stepDrivers/welcomeHtm.ts`
      (update the `html` driver from `{ html: "" }`; the "empty markdown"
      comment goes with it) and its wiring in
      `packages/studio/src/test/headlessAuthor/stepDrivers/inventory.ts`.
- [ ] Journey replay handler: `packages/studio/src/test/journey-runner.ts:858`
      (`case "html"`).
- [ ] Drift guard: add the completion function to INVENTORY in
      `packages/studio/src/test/headlessAuthor/driftGuard.ts`, mirroring the
      `completeOskStep` entry (line 57); the completion helper lives in
      `packages/studio/src/lib/` (cf. `lib/oskStepCompletion.ts`). Verify
      whether PR #2549's `completeFallbackPolicyStep` has landed first —
      it had not at fdff081a.
- [ ] Golden-walk fixtures: `packages/studio/tests/steps/__fixtures__/goldenWalk/{copy,adapt}.json`,
      `packages/studio/e2e/fixtures/golden-walk/` (README + zips),
      `packages/studio/e2e/golden-walk.spec.ts`,
      `packages/studio/tests/steps/stepHost.goldenWalk.test.tsx`. A new
      step shape is a baseline-recapture candidate (see the #2523 lesson in
      MEMORY.md: capture on a merge with main, never from a stale base).
- [ ] Spec-trace section: `docs/spec-trace.json` (see
      `packages/studio/src/steps/types.ts:121`) and
      `packages/studio/src/steps/manifest.specref.json` (`"html":
      ["specs/html-editor"]`, lines 85–86). The `html` step is already
      registered in the manifest (`manifest.ts:518`), Phase F
      (`phases.ts:135–139`, `stepIds: ["help", "html", "icon"]`), and the
      advance route (`advance.ts:375–379`, `help → html → icon`) — no new
      registration needed, verify nothing regressed.
- [ ] Registry counts: `packages/studio/src/decisions/derivedSurfaceRegistry.ts`
      (new store actions need entries; validate per item, never assert a
      census — see the i18n skill).
- [ ] Stale comments to fix in the same pass: `registerEditorSteps.ts:395–396`
      ("Markdown despite the extension"), `welcomeHtm.ts` ("Markdown source"),
      `HtmlEditor.tsx` header comment (generated-exports framing),
      `stepDrivers/welcomeHtm.ts` ("empty markdown").

## i18n note

New strings go through the Lingui macro + catalog sync — see
`~/workspace/custom-skills/keyboard_studio_i18n_catalogs/SKILL.md`:
real French translations for every new key (never English in the French
catalog), extractor key-sort order kept byte-stable, `content-i18n-lint`
and `content-i18n-freshness --check` green before pushing. Caution from
PR #2549: token-lint flags `#` + 4 hex digits in string literals — write
issue numbers in user-visible strings without the `#` (e.g. "issue 2155").

## Nav note

Footer nav via `usePublishStepNav`, already in place in `HtmlEditor.tsx`.
Back and Continue must not move; extra buttons (file selector is content,
not nav) appear to their right. The file selector lives in the step body,
not the footer.

## Issue #2155

GitHub issue #2155 (OPEN, P3, `enhancement`, assigned KevinPNG):
"copy-track welcome/help authoring — element spec from a keyboards-corpus
scan". Its element spec (§§1–5: shell, h1 + intro, per-layer Keyboard
Layout with charts, derived how-to notes, nothing else by default; help
.php parity 11.9/11.10) is the target shape for authored/generated
welcome + help. This work satisfies the **authoring half**: a copy author
gets real fields for the spec's §2/§4 content and the edits persist.
It does **not** by itself satisfy #2155's acceptance (a copy of
sil_cameroon_qwerty producing a welcome.htm in corpus-normal shape with
11.9/11.10 passing by construction) — the §3/§4 *generated* sections
(layout charts inside the section structure, derived how-to notes) remain
the `helpDocsRender` generators' job, and the step edits files rather than
restructuring generated sections. Do NOT close #2155 from this work; note
the partial satisfaction on it when the PR lands.

## Scope

- File selector for all six doc members (presence from the projected VFS;
  absent members shown absent, never as dead files).
- TipTap WYSIWYG (lazy-loaded) as primary mode; Monaco code as secondary;
  read-only HTML preview retained.
- Per-file seeding per the matrix above; per-file authored overrides in the
  store; override wins at projection, serialization, and preview.
- `welcomeHtm` becomes a real recorded decision with writes.
- `.php` body editing with PHP preserved per the decision above.
- Regression tests: edit survives into the serialized download on BOTH
  tracks (see handoff), PHP byte-identical round-trip, seed-never-blank on
  adapt/open, copy never inherits base prose.

Out of scope: editing `HISTORY.md` / `LICENSE.md` (read-only, above);
restructuring the generated sections (§3/§4 of #2155); the Open-walk
docs-carry behavior itself (spec 111, unchanged); Vercel preview
verification (implementer's job at PR time).

## Open questions (need a ruling — do not guess)

1. **Staleness of authored overrides.** An authored file freezes the
   generated sections (layout charts, description) as of the seed. If the
   author later changes help-docs answers, identity, or layout, should the
   Documentation step (or the checklist) warn that a touched file's
   generated content may be stale — or is silent freeze acceptable? (The
   ruling settles "author wins"; only the warning is open.)
2. **HISTORY.md / LICENSE.md editability.** Spec says read-only with
   reasons above. If Matthew wants them editable, that needs a design for
   how an edit survives `renderHistoryMd` / the LICENSE stub (they are
   re-rendered every production).
3. **`.md` WYSIWYG fallback.** Spec says `@tiptap/markdown` for `.md`
   files. If its round-trip fails the repo's Markdown fixtures, the
   fallback is Monaco Markdown mode as primary for `.md` — implementer
   proves it with a round-trip test and says so in the PR, no silent swap.
