# Documentation step: side-by-side "as installed" preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On desktop, the Documentation step shows the file being edited beside a sandboxed preview that renders it the way users will see it once the keyboard is installed.

**Architecture:**
- **Pure helpers** build the preview document: a full HTML page with its relative asset references rewritten to `data:` URLs, Markdown rendered to HTML, and the help body wrapped in a shell.
- **A hook** projects the working copy once, the same projection the download uses, and exposes its assets.
- **A frame component** renders the document in an `<iframe sandbox srcdoc>`.
- **`HtmlEditor.tsx`** places the frame beside the editor above `BREAKPOINTS.tabletMax` and keeps the three-way toggle below it.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, Lingui (spec 046), `marked` for Markdown.

**Spec:** [docs/superpowers/specs/2026-11-16-docs-side-by-side-preview-design.md](../specs/2026-11-16-docs-side-by-side-preview-design.md)

## Global Constraints

- Display only: nothing here writes to the working-copy store, the VFS, or the decision record. Continue/Back behaviour and the payload are unchanged.
- Test ids `html-file-<member>`, `html-continue`, `html-back` are kept.
- Narrow viewports (`useIsNarrow(BREAKPOINTS.tabletMax)` true) keep today's tabs and the Write / Code / Preview toggle unchanged, including the existing `editor.assignLoop.html.mode.preview` id.
- Preview iframe: `sandbox=""` (no `allow-scripts`), content via `srcdoc`, with a `title` naming the file.
- New UI strings use ids under `editor.assignLoop.html.preview.*`, and their French goes into `src/locales/fr/messages.json` in the same change. `pnpm run i18n-catalog-lint` must pass.
- Studio conventions: [packages/studio/CLAUDE.md](../../../packages/studio/CLAUDE.md) (accessibility spec 056, i18n spec 046).
- **Commits:** each task ends with a commit step. Kevin's global rule requires his explicit go-ahead before committing, so confirm before the first commit of the run.

**Calls made in this plan, departing from or settling the design:**
- **`data:` URLs instead of object URLs.** A `sandbox=""` frame has an opaque origin and is not guaranteed to resolve the parent's `blob:` URLs. `data:` URLs always load, and need no revocation.
- **`marked` (17.0.6) promoted to a direct studio dependency.** It is already installed and locked as `@tiptap/markdown`'s own dependency, so this adds no new package. TipTap's Markdown extension has no standalone markdown-to-HTML call.
- **Assets are projected once, when the step mounts.** Editing the docs changes only the document text, never the assets.

## Review Focus

1. **Welcome page convention:** `source/welcome/welcome.htm` (folder) versus flat `source/welcome.htm`. Relative refs must resolve against the folder the file actually ships in. Test in Task 1 (`baseDirFor`).
2. **Ref shapes:** `./x.png`, `../x.css`, `x.png?v=2#a`, `my%20chart.png`, and mixed-case extensions must resolve. `http:`, `https:`, `//cdn`, `data:`, `mailto:` and `#frag` must be left untouched. Test in Task 1 (`resolveRef`).
3. **Missing asset:** a reference to a file the working copy doesn't have is left as written (a broken image, as offline) and nothing throws. Test in Task 1.
4. **Projection unavailable:** if `projectWorkingCopyForOutput()` resolves `null` or rejects, the preview still renders the text without assets, and nothing throws into React. Test in Task 3.
5. **Stylesheets that load images:** `kb.css` containing `url(images/bg.png)` must show the image. Inside a linked stylesheet, CSS `url()` resolves against the stylesheet's own folder, not the page's. Test in Task 1 (`rewriteCssUrls`).

---

### Task 1: Pure preview-document helpers

**Files:**
- Create: `packages/studio/src/lib/docPreviewDocument.ts`
- Test: `packages/studio/src/lib/docPreviewDocument.test.ts`

**Interfaces:**
- Produces:
  - `type AssetLookup = (vfsPath: string) => string | undefined` — returns a `data:` URL for a VFS path, or `undefined` if the file is absent.
  - `resolveRef(baseDir: string, ref: string): string | null` — the VFS path for a relative ref. `baseDir` is `""` (root) or ends with `/`. Strips `?query` and `#hash`, percent-decodes, and normalises `.`/`..`. Returns `null` for absolute or external refs, or a `..` that escapes the root.
  - `rewriteCssUrls(css: string, cssDir: string, lookup: AssetLookup): string` — rewrites `url(...)` (quoted or not) for refs that resolve and exist.
  - `rewriteHtmlRefs(html: string, baseDir: string, lookup: AssetLookup): string` — rewrites `src=` / `href=` attribute values and `url()` inside `<style>` blocks and `style=""` attributes.
  - `baseDirFor(member: DocPreviewMember, welcomePath: string | null): string`, where `type DocPreviewMember = "welcome-htm" | "readme-htm" | "help-php" | "readme-md" | "history-md" | "license-md"`.
    - welcome-htm: the folder of `welcomePath`, else `"source/welcome/"`
    - readme-htm: `"source/"`
    - help-php: `"source/help/"`
    - the Markdown members: `""`

- [ ] **Step 1: Write the failing tests.** In `docPreviewDocument.test.ts`, with `lookup = (p) => ({ "source/welcome/kb.css": "data:text/css;base64,AA==", "source/welcome/chart.png": "data:image/png;base64,AA==", "source/welcome/img/bg.png": "data:image/png;base64,BB==", "source/kb.css": "data:text/css;base64,CC==", "source/welcome/my chart.png": "data:image/png;base64,DD==" } as Record<string,string>)[p]`:
  - `resolveRef("source/welcome/", "chart.png")` → `"source/welcome/chart.png"`; `"./chart.png"` → same; `"../kb.css"` → `"source/kb.css"`; `"chart.png?v=2#a"` → `"source/welcome/chart.png"`; `"my%20chart.png"` → `"source/welcome/my chart.png"`.
  - `resolveRef(..., x)` → `null` for each of `"https://x/y.png"`, `"http://x"`, `"//cdn/x.css"`, `"data:image/png;base64,AA=="`, `"mailto:a@b"`, `"#top"`, `"/abs.png"`, `"../../../x.png"`.
  - `rewriteHtmlRefs('<link rel="stylesheet" href="kb.css"><img src="chart.png"><img src="missing.png"><a href="https://keyman.com">k</a>', "source/welcome/", lookup)`: contains `href="data:text/css;base64,AA=="` and `src="data:image/png;base64,AA=="`, still contains `src="missing.png"` and `href="https://keyman.com"`.
  - `rewriteHtmlRefs("<img src='chart.png'>", ...)` handles single quotes, and `rewriteHtmlRefs('<div style="background:url(chart.png)"></div><style>.a{background:url("chart.png")}</style>', ...)` rewrites both `url()`s.
  - `rewriteCssUrls(".a{background:url(img/bg.png)} .b{background:url('nope.png')}", "source/welcome/", lookup)` → contains `url("data:image/png;base64,BB==")` and still contains `url('nope.png')`.
  - `baseDirFor("welcome-htm", "source/welcome.htm")` → `"source/"`; `baseDirFor("welcome-htm", "source/welcome/welcome.htm")` → `"source/welcome/"`; `baseDirFor("welcome-htm", null)` → `"source/welcome/"`; `baseDirFor("help-php", null)` → `"source/help/"`; `baseDirFor("readme-md", null)` → `""`.

- [ ] **Step 2: Run the tests and confirm they fail.**
  Run: `pnpm --filter @keyboard-studio/studio exec vitest run src/lib/docPreviewDocument.test.ts`
  Expected: FAIL, module `./docPreviewDocument.ts` not found.

- [ ] **Step 3: Implement the five exports in `docPreviewDocument.ts`.** A regex over attribute values (`\s(src|href)\s*=\s*("([^"]*)"|'([^']*)')`) and `url\(\s*(['"]?)([^'")]+)\1\s*\)` is enough; no DOM parser. Leave a ref unchanged when `resolveRef` is `null` or `lookup` is `undefined`.

- [ ] **Step 4: Run the tests and confirm they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** (after Kevin's go-ahead): `git add packages/studio/src/lib/docPreviewDocument.ts packages/studio/src/lib/docPreviewDocument.test.ts` then `git commit -m "feat(studio): resolve documentation preview asset references against the working copy"`.

### Task 2: Build the preview document per member (with Markdown)

**Files:**
- Modify: `packages/studio/package.json` (add `"marked": "17.0.6"` to `dependencies`), then `pnpm install` to update `pnpm-lock.yaml`
- Modify: `packages/studio/src/lib/docPreviewDocument.ts`
- Test: `packages/studio/src/lib/docPreviewDocument.test.ts`

**Interfaces:**
- Consumes: Task 1's `rewriteHtmlRefs`, `baseDirFor`, `AssetLookup`, `DocPreviewMember`.
- Produces: `buildPreviewDocument(input: { member: DocPreviewMember; text: string; welcomePath: string | null; helpCssPaths: readonly string[]; lookup: AssetLookup }): string`, a complete HTML document string for `srcdoc`:
  - **welcome-htm, readme-htm:** `text` as-is (the full document, keeping `<head>`), passed through `rewriteHtmlRefs`. If `text` has no `<html` tag, wrap it in the shell below.
  - **help-php:** the body from `splitPhpPage(text).body`, wrapped in the shell, with a `<link rel="stylesheet" href="…">` for each `helpCssPaths` entry, written relative to `source/help/` (its basename), then `rewriteHtmlRefs` with `"source/help/"`.
  - **readme-md, history-md, license-md:** `marked.parse(text, { gfm: true, async: false })`, wrapped in the shell with the exported constant `MARKDOWN_PREVIEW_CSS`: GitHub-like base styles, a system font stack, `max-width: 880px`, 16px padding, bordered tables, and shaded `code`/`pre`.
  - **Shell:** `<!doctype html><html><head><meta charset="utf-8">…</head><body>…</body></html>`.

- [ ] **Step 1: Write the failing tests** (same file, new `describe("buildPreviewDocument")`):
  - welcome-htm, text `'<html><head><link rel="stylesheet" href="kb.css"></head><body><h1>Hi</h1></body></html>'`, `welcomePath: "source/welcome/welcome.htm"` → contains `<head>` and `href="data:text/css;base64,AA=="`.
  - welcome-htm, text `"<h1>Hi</h1>"` (fragment) → starts with `<!doctype html>` and contains `<h1>Hi</h1>`.
  - help-php, text `"<?php require 'header.php'; ?>\n<h1>Help</h1>"`, `helpCssPaths: ["source/help/kb.css"]`, lookup returning `"data:text/css;base64,EE=="` for that path → contains `<h1>Help</h1>`, contains `href="data:text/css;base64,EE=="`, does not contain `<?php`.
  - readme-md, text `"# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |"` → contains `<h1`, `<table`, and the `max-width: 880px` style.

- [ ] **Step 2: Run the tests and confirm they fail.** Run the Task 1 command. Expected: FAIL, `buildPreviewDocument` is not exported.

- [ ] **Step 3: Add `marked` and implement `buildPreviewDocument` and `MARKDOWN_PREVIEW_CSS`.** Import `splitPhpPage` from `packages/studio/src/lib/authoredDocs.ts`, where `HtmlEditor.tsx` gets it; don't copy it.

- [ ] **Step 4: Run the tests and confirm they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** (after go-ahead): `git add packages/studio/package.json pnpm-lock.yaml packages/studio/src/lib/docPreviewDocument.ts packages/studio/src/lib/docPreviewDocument.test.ts` then `git commit -m "feat(studio): build the documentation preview as the installed page, with Markdown rendered"`.

### Task 3: Hook exposing the projected assets

**Files:**
- Create: `packages/studio/src/hooks/useDocPreviewAssets.ts`
- Test: `packages/studio/src/hooks/useDocPreviewAssets.test.ts`

**Interfaces:**
- Consumes: `projectWorkingCopyForOutput()` from `packages/studio/src/lib/serializeWorkingCopy.ts`, which resolves to `{ vfs: VirtualFS; … } | null`. Also `AssetLookup` from Task 1, and `rewriteCssUrls`.
- Produces: `useDocPreviewAssets(): { lookup: AssetLookup; welcomePath: string | null; helpCssPaths: string[]; ready: boolean }`.
  - Projects once on mount.
  - `welcomePath` is `WELCOME_PAGE_PATH` if present in the projected VFS, else `FLAT_WELCOME_PATH` if present, else `null`. Both constants come from `packages/studio/src/lib/welcomeFolder.ts`; don't hard-code the paths.
  - `helpCssPaths` lists the `.css` entries directly under `source/help/`, sorted.
  - `lookup` maps every projected entry under `source/` or the root, except `.kmn`, `.kps`, `.kpj`, `.htm`, `.php` and `.md`, to a `data:` URL whose MIME type comes from the extension: png, jpg/jpeg, gif, svg, ico, webp, css, ttf, otf, woff, woff2, else `application/octet-stream`.
  - `.css` text is first passed through `rewriteCssUrls` with the stylesheet's own folder.
  - Until ready, or on `null` or rejection, `lookup` returns `undefined` for everything, `ready` stays `false`, and nothing throws.

- [ ] **Step 1: Write the failing tests** with `vi.mock("../lib/serializeWorkingCopy.ts", …)` and `renderHook` + `waitFor`:
  - Projected VFS (`createVirtualFS` from `@keyboard-studio/contracts`) holding `source/welcome/welcome.htm`, `source/welcome/kb.css` = `".a{background:url(bg.png)}"`, `source/welcome/bg.png` (binary bytes `[1,2,3]`) and `source/help/kb.css` gives:
    - `ready` true and `welcomePath` `"source/welcome/welcome.htm"`;
    - `helpCssPaths` `["source/help/kb.css"]`;
    - `lookup("source/welcome/bg.png")` starting `"data:image/png;base64,"`;
    - the decoded `lookup("source/welcome/kb.css")` containing `data:image/png;base64,`;
    - `lookup("source/welcome/welcome.htm")` is `undefined`.
  - Projection resolving `null` gives `ready: false`, and `lookup("x")` is `undefined`.
  - Projection rejecting gives the same, with no unhandled rejection.

- [ ] **Step 2: Run the tests and confirm they fail.**
  Run: `pnpm --filter @keyboard-studio/studio exec vitest run src/hooks/useDocPreviewAssets.test.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement the hook.** Guard against a state update after unmount with a `cancelled` flag in the effect, the same way `CodeReviewList.tsx` calls `projectWorkingCopyForOutput()`.

- [ ] **Step 4: Run the tests and confirm they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** (after go-ahead): `git commit -m "feat(studio): expose the projected documentation assets to the preview"` covering the two files.

### Task 4: Preview frame and side-by-side layout in `HtmlEditor`

**Files:**
- Create: `packages/studio/src/editors/assignLoop/DocPreviewFrame.tsx`
- Modify: `packages/studio/src/editors/assignLoop/HtmlEditor.tsx` (mode toggle around :627-640, preview block :699-729, desktop layout :764-787, file header comment :12-18)
- Modify: `packages/studio/src/locales/{en,fr}/messages.json` and the compiled `messages.js` beside them, via `messages:extract` plus whatever compile step the package's scripts chain
- Test: `packages/studio/src/editors/assignLoop/HtmlEditor.test.tsx`

**Interfaces:**
- Consumes: `buildPreviewDocument` (Task 2) and `useDocPreviewAssets` (Task 3).
- Produces: `DocPreviewFrame({ member, text, fileLabel }: { member: DocPreviewMember; text: string; fileLabel: string }): JSX.Element`. It calls `useDocPreviewAssets()` and `buildPreviewDocument(...)` (memoised on `member`, `text` and the hook result), and renders:
  - `<iframe sandbox="" srcDoc={doc} title={…} data-testid="html-preview-frame" style={{ border: "1px solid var(--app-border)", borderRadius: 8, background: "#fff", width: "100%", flex: 1, minHeight: 300 }} />`
  - title message id `editor.assignLoop.html.preview.frameTitle`, `"Preview of {fileLabel}, as installed"`, French `"Aperçu de {fileLabel}, tel qu’installé"`
  - when `text.trim() === ""`: the existing `editor.assignLoop.html.preview.empty` message instead of the frame.

- [ ] **Step 1: Write the failing tests** in `HtmlEditor.test.tsx`. Add `vi.mock("../../hooks/useDocPreviewAssets.ts", () => ({ useDocPreviewAssets: () => ({ lookup: () => undefined, welcomePath: null, helpCssPaths: [], ready: true }) }))` and a controllable `vi.mock("../../hooks/useViewport.ts", …)` whose `useIsNarrow` returns a hoisted `narrow.value`.
  - `desktop: editor and preview frame are shown together, with no Preview toggle`: with `narrow.value = false`, render and select `html-file-welcome-htm`. Then `getByRole("button", { name: "Write" })` and `getByTestId("html-preview-frame")` are present, `queryByRole("button", { name: "Preview" })` is null, and the frame's `title` contains `welcome.htm`.
  - `desktop: read-only files show only the preview frame`: select `html-file-history-md`. Then `html-preview-frame` is present and the `Write` button is absent.
  - `narrow: the Write / Code / Preview toggle is unchanged`: with `narrow.value = true`, the `Preview` button is present, and clicking it shows `html-preview-frame`.
  - Update the existing assertions that read preview text through the old inline `<div>`/`<pre>` (e.g. the test at :238) to read the frame's `srcdoc` attribute instead.

- [ ] **Step 2: Run the tests and confirm they fail.**
  Run: `pnpm --filter @keyboard-studio/studio exec vitest run src/editors/assignLoop/HtmlEditor.test.tsx`
  Expected: FAIL. The `html-preview-frame` test id is not found, and the Preview button is present on desktop.

- [ ] **Step 3: Implement `DocPreviewFrame`, and change `HtmlEditor`:**
  - Hoist `showTree` (it is already `!useIsNarrow(BREAKPOINTS.tabletMax)`) and name it `sideBySide`.
  - When `sideBySide`, the toggle lists only `rich` and `code`, and `effectiveMode` never becomes `"preview"`. `selectMember` no longer sets `"preview"` for read-only members on desktop.
  - The desktop right column becomes a row: the editor column (`flex: 1, minWidth: 0`) and the preview column (`flex: 1, minWidth: 0`) holding `DocPreviewFrame`. For read-only members, only the preview column renders, at full width.
  - Narrow keeps today's structure. The old inline preview block is replaced by `DocPreviewFrame` in both layouts.
  - `text` is `isEditable(selected) ? currentText(selected) : readOnlyText ?? ""`. `fileLabel` is `MEMBER_PATH[selected]`, with `<keyboard id>` replaced by the real `keyboardId`.
  - Update the header comment's "read-only preview as a third view" line.

- [ ] **Step 4: Extract messages and add the French.**
  Run: `pnpm --filter @keyboard-studio/studio run messages:extract`. Then set the French for `editor.assignLoop.html.preview.frameTitle` in `src/locales/fr/messages.json`, and run `pnpm run i18n-catalog-lint`.
  Expected: `[OK]`, with no empty targets.

- [ ] **Step 5: Run the tests and confirm they pass.**
  Run: `pnpm --filter @keyboard-studio/studio exec vitest run src/editors/assignLoop/HtmlEditor.test.tsx src/lib/docPreviewDocument.test.ts src/hooks/useDocPreviewAssets.test.ts`
  Expected: PASS.

- [ ] **Step 6: Check it in the running app.** Use the `run` skill. Walk a copy of `sil_cameroon_azerty` to the Documentation step at desktop width (1440 px) and confirm:
  - welcome.htm shows its `kb.css` styling and layout-chart images beside the editor;
  - typing in Code updates the preview;
  - README.md renders as Markdown;
  - at 700 px the Write / Code / Preview toggle returns.

  Take screenshots for the PR.

- [ ] **Step 7: Full gates.** Run `pnpm lint` and `pnpm --filter @keyboard-studio/studio test`. Expected: both pass.

- [ ] **Step 8: Commit** (after go-ahead): `git commit -m "feat(studio): show the documentation preview beside the editor, rendered as installed"` covering the frame, the editor, the test, and the locale catalogs.
