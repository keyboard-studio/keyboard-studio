# Documentation step: side-by-side "as installed" preview — design

Date: 2026-11-16 · Status: draft for review · Size: small change (one step)

## Intent

On the Documentation step (`packages/studio/src/editors/assignLoop/HtmlEditor.tsx`) the author
should see, while editing a file, **what a keyboard user will see once the keyboard is out
there**. That needs two changes. The preview sits beside the editor instead of behind a third
Write / Code / **Preview** toggle. It also renders each file the way its real destination does.
Found while hand-testing the Ewondo adaptation.

## Where each file is seen, and what "faithful" means

| File | Seen by users in | Preview must show |
|---|---|---|
| `source/welcome/welcome.htm` (or flat `source/welcome.htm`) | Keyman's welcome window after install | the full document: its `<head>`, its stylesheet (e.g. `kb.css`), its images (layout charts, flags) |
| `source/readme.htm` | the installer, before install | the full document |
| `source/help/<id>.php` | help.keyman.com | the page body with the help folder's stylesheet; the site's own chrome is not reproduced |
| `README.md` | GitHub / the keyboards repo | rendered Markdown |
| `HISTORY.md`, `LICENSE.md` (read-only) | the repo | rendered Markdown |

## Goals

- Editor and preview visible at once on desktop; the preview updates as the author types or edits.
- Faithful rendering per the table: the page's own CSS and images, resolved from what the
  download would ship, and Markdown rendered rather than shown raw.
- The keyboard's CSS and the studio's CSS never affect each other.

## Non-goals

- Reproducing help.keyman.com's site chrome or GitHub's exact Markdown styling. Readable,
  GitHub-like Markdown is enough.
- Running scripts in the previewed pages.
- Showing assets that are not in the working copy, such as remote images. They show as broken,
  as they would offline.
- Changing what gets saved or downloaded. This is display only.

## Anti-goals

- A preview that looks right in the studio but differs from the installed page, which is
  today's problem.
- Breaking the existing Write and Code editing, the file tree, or Continue/Back. The test ids
  `html-file-<member>`, `html-continue` and `html-back` stay.

## Approaches

1. **Isolated page frame beside the editor — chosen.** A sandboxed iframe renders the whole
   document. Relative `src`/`href` references are resolved to the working copy's files, so the
   page's CSS and images show. The frame keeps the keyboard's CSS out of the studio and the
   studio's out of the page. Cost: resolving relative references against in-memory files.
2. *Move today's preview beside the editor and render Markdown.* Rejected: welcome.htm still
   renders in studio styles without its CSS and images, which misses the point.
3. *Preview from the built package.* Rejected: a full compile per edit is too slow for live
   typing.

## Design

- **Layout (desktop, wider than `BREAKPOINTS.tabletMax`):** the file tree (240 px) stays at the
  left. The rest splits into the editor (Write | Code toggle) and the preview, 50/50. The
  **Preview** toggle button goes away. Read-only files (HISTORY.md, LICENSE.md) show the preview
  only, across the full width.
- **Narrow viewports (tabletMax and below):** unchanged. The file tabs stay, and the
  Write / Code / Preview toggle remains, because three panes don't fit.
- **Preview frame:** an `<iframe sandbox>` (no `allow-scripts`) fed with `srcdoc`.
  - HTML members get the full current document text, not just the body, so `<head>`, `<link>`
    and `<style>` apply.
  - The help `.php` gets its body wrapped in a minimal HTML shell that links the help folder's
    stylesheet.
  - Markdown members are rendered to HTML with GitHub-like base styles. The studio already ships
    `@tiptap/markdown`; the builder should reuse its parser rather than add a dependency, if it
    can produce HTML standalone.
- **Asset resolution:** relative references in the previewed document (`img src`, `link href`,
  CSS `url()`) are resolved against the file's own folder, using **the same projection the
  download uses** (`projectWorkingCopyVfs`). Generated layout charts and the welcome folder's
  files then match what ships. Each resolved file is served as an object URL, and the URLs are
  revoked when the preview changes or unmounts.
- **Update cadence:** the preview follows the editor text. Re-projecting the VFS is not tied to
  keystrokes; asset URLs are rebuilt only when the projection changes. Display-only, so no new
  validation timer (decision D3 is not involved).
- **Accessibility (spec 056):** the iframe gets a `title` naming the file ("Preview of
  welcome.htm, as installed"). The preview is not a focus trap, and keyboard users can tab into
  and out of it.
- **i18n (spec 046):** new strings (iframe title, any pane label) get message ids under
  `editor.assignLoop.html.preview.*` with French in the same change. The Preview toggle's
  existing id stays, because narrow viewports still use it.

## Left to the builder

- How to obtain the projected VFS in the step cheaply (an existing hook, or memoised
  projection), and confirm it stays fast. The 0-edit projection is about 17 ms.
- Exact Markdown-to-HTML path, as above.
- Whether the editor/preview split is resizable. Default: a fixed 50/50.
- Tests: unit tests for reference resolution (relative path, `../`, missing file, CSS `url()`)
  and that layout switches at the breakpoint. Update the existing e2e coverage that clicks the
  Preview toggle on desktop.
