# @keyboard-studio/studio

Vite + React 18 SPA shell for the keyboard-studio authoring tool.

## What is here today (POC, June 2026)

This package currently hosts a **proof-of-concept live-preview pane** that exercises the full in-browser compile pipeline:

- pick a base keyboard from a dropdown
- the loader fetches its source from the `keymanapp/keyboards` release tree (via the Vite `/kbd-proxy` dev-proxy)
- `@keyboard-studio/engine`'s `compile()` runs `@keymanapp/kmc-kmn` against the VFS, producing `.kmx` + `.kvk` + `.js` artifacts entirely in the browser
- the `.js` is fed to a vendored KeymanWeb 18.0.245 iframe at `public/osk-frame.html`
- the OSK renders and the textbox accepts typing through the live keyboard

That proves the pipeline. **It is not the spec'd UX.**

## POC scaffolds vs spec'd UX

The following components exist solely to drive the POC and **will be replaced** when the spec'd survey / gallery / strategy-picker / lint UX lands in their own issues. They are documented here so the next contributor doesn't mistake them for design decisions.

| Component (POC) | Will be replaced by |
|---|---|
| `<PreviewShell>` (two-pane with picker on left) | The spec §4 line 107 two-pane SPA: **survey on left**, live preview on right. Left pane becomes the multi-step wizard, not a one-shot dropdown. |
| `<BaseKeyboardPicker>` (flat `<select>`) | The spec §8 Phase A identity flow (`#48`, `#49`, `#51`) — language + region + base-keyboard chosen across multiple wizard steps, not via a single dropdown. |
| `<MetadataCard>` (id / path / script / version display) | Internal-only debugging affordance. No design element corresponds to it; nothing wires it into the final shell. |
| `<MetadataCard>` "Try typing" hint (per-keyboard usage examples) | Pure debugging affordance for this POC's verification step. Belongs nowhere in the spec'd UI. |
| `<ModifierBar>` (Shift/Ctrl/Alt/Caps toggle buttons) | Final modifier UX is not yet designed (`#39` only covers the preview pane in principle). KMW 18 has no public `setModifiers()` so the buttons are no-ops today; the post-message channel is wired. |
| `<OskModeToggle>` (Desktop / Mobile KB) | Confirmed as a real UX need but the affordance / wording / placement isn't final. |
| `<LintChipRail>` (empty placeholder) | The real chip rail with muted "inherited from base" rendering (`LintFinding.origin: "upstream"`) lands when the validator wiring catches up (`#15`, `#10`, et al.). |
| `<UnsupportedScriptStub>` (CJK / Ethiopic) | The stub copy / styling is provisional; spec §9 / §16 dictates the eventual final copy. |

## Production-shape pieces (these stay)

These are not POC throwaway. They are the production-shape integration that any future UX builds on:

- `@keyboard-studio/engine`'s `compile()` — kmcmplib + kmw-compiler running entirely in-browser via `@keymanapp/kmc-kmn`. Callback-bridged to VFS.
- `@keyboard-studio/engine`'s `fetchKeyboardSourceToVfs()` — release-tree fetch + dependency discovery via the `.kmn` header `store(&...)` parser, plus optional `.kpj` flag parsing.
- `parseKmnHeaderStores()` and `parseKpjFlags()` parsers.
- `LintFinding.origin?: "authored" | "upstream"` contract field (additive, backward-compatible).
- The `<OSKFrame>` React wrapper + `useOskChannel` postMessage bridge — the architectural shape (iframe isolation + typed `OskCommand` / `OskEvent` channel) is correct, though the exact message vocabulary may grow.
- The `useKeyboardArtifact` state machine (`idle → fetching → compiling → ready | error`) — production-shape, regardless of what UI sits on top of it.

## Dev-only mechanics (revisit before production)

- **Vite proxies** (`/kbd-proxy`, `/kbd-api`, `/kbd-js-proxy`) — dev-server only. Production needs a CSP-safe alternative: a cached artifact server, signed CDN URLs, or compile-on-demand backend. Tracked as a follow-up.
- **`optimizeDeps.exclude: ['@keymanapp/kmc-kmn']`** + the `pathShim.ts` alias — bundler tape-and-glue for a Node-targeted ESM dep. May or may not survive Vite-version bumps. Document any future failure and re-evaluate.
- **`sandbox="allow-scripts allow-same-origin"` on the iframe** — `allow-same-origin` is required in dev for the postMessage bridge + KMW relative fetches. Production should tighten this once the asset-serving story is finalised.
- **`https://s.keyman.com/kmw/engine/18.0.245/` for KMW CSS/font resources** — fast for dev but is a runtime CDN dependency. Production should vendor (or proxy) the full asset set, not just `keymanweb.js`.

## Framework choice

**Vite + React 18 + TypeScript 6.** Picked at scaffold time (`#22`). Reasons:

- React's component model fits the spec'd three-pane layout cleanly.
- React 18's concurrent features and `useReducer` cover the `useKeyboardArtifact` state machine without an external lib.
- Vite gives sub-second HMR and first-class ESM support — important for fast iteration on the WASM-pipeline integration which has a 1-3s cold-start.
- TypeScript 6 matches the rest of the monorepo (engine, contracts).

KeymanWeb runs in an iframe (not embedded directly) per the cycle-1 km-keyman review: KMW installs global `document` listeners that would conflict with React's synthetic event system.

## Scripts

```sh
pnpm --filter @keyboard-studio/studio dev        # start Vite dev server
pnpm --filter @keyboard-studio/studio build      # production build
pnpm --filter @keyboard-studio/studio typecheck  # tsc --noEmit
```

The dev server picks the first free port from 5173 onward.

## Headless debug harness

`scripts/debug-preview.py` (in the repo root) launches Chromium via Playwright, drives the picker, and dumps the overlay text + all console messages. Useful when iterating on the engine without bouncing through a browser tab.

```sh
python scripts/debug-preview.py <port> <keyboard_id>
```

## Next steps (in their own issues)

- `#22` — flesh out the spec'd two-pane layout (60/40 resizable divider; routing for `pick-base / survey / gallery / preview / output`)
- `#48`, `#49`, `#51` — the survey wizard replaces `<BaseKeyboardPicker>` on the left
- `#10`, `#15` — Layer A semantic checks + Layer B style; wire findings into `<LintChipRail>` with the `origin: "upstream"` muting
- Follow-up: production-safe replacement for the Vite dev proxies
