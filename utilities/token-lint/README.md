# token-lint

Bans hard-coded colors in `packages/studio/src/**/*.ts(x)`. Phase 0 of epic
#533 (design-system adoption): lands the gate first so the rest of the
branch can burn the existing debt down without the count creeping back up.

## What it bans

1. Hex color literals — `#` followed by exactly 3, 4, 6, or 8 hex digits at
   a word boundary.
2. `rgb(` / `rgba(` / `hsl(` / `hsla(` with a literal numeric first channel
   (token composition like `rgb(var(--accent-rgb) / 0.5)` is fine).

## What it allows, and why

- `packages/studio/src/styles/` and `index.css` — the token-definition
  sites themselves (belt-and-braces; the scan is `.ts`/`.tsx` only anyway).
- `packages/studio/src/dashboard/` — excluded wholesale. It's a dev-facing
  surface, and its SVG components pass colors as presentation attributes
  (`fill=`/`stroke=`), where CSS `var()` doesn't substitute; converting
  those needs a separate change, deferred from branch 1.
- Test files: `*.test.ts(x)`, anything under `__tests__` or `e2e`, and
  `*.fixture.ts`.
- Three third-party brand colors that must match the provider's brand
  exactly and so are intentionally not tokenized: `#238636` / `#2ea043`
  (GitHub sign-in button) and `#1a73e8` (Google sign-in button). See
  `THIRD_PARTY_BRAND` in `index.js`.
- Comment-only lines, Unicode/entity notation (`\u`, `U+`, `0x`, `&#`), and
  lines containing `href=`, `#/`, `data:`, `id="`, or `aria-` (anchors,
  hash routes, data URIs, DOM ids) — false-positive guards, not color
  exemptions.

## Baseline ratchet

`baseline.json` maps repo-relative file path -> allowed violation count. A
file with more violations than its baseline entry is an error. Fewer prints
an "improved" line and asks you to re-run with `--update-baseline` to lock
it in. A file absent from the baseline must have zero violations — no
sneaking in a new hard-coded color under an unlisted file.

## Flags

- `--update-baseline` — rewrite `baseline.json` from the current scan.
- `--report` — print the full per-file table and exit 0.
