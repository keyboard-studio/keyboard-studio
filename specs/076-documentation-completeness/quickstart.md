# Quickstart: Validating spec 076 (documentation completeness)

Runnable scenarios proving the feature end-to-end. Contracts:
[contracts/](contracts/); entities: [data-model.md](data-model.md).

## Prerequisites

- Node ≥ 22.19.0, pnpm 9; `pnpm install && pnpm build` from the repo root.
- The sibling `../keyboards` checkout on the `keyboard-studio/keyboards` fork
  `master` (needed for base-adaptation scenarios and the SC-002 sweep).
- Studio dev server: `pnpm dev` (Vite proxies base fetches via `/kbd-proxy`).

## Unit/integration gates (per phase)

```sh
pnpm --filter @keyboard-studio/engine test     # renderers, loader, descriptor, charts
pnpm --filter @keymanapp/keyboard-lint test    # the 12 doc check modules (13 codes) + bijection test
pnpm --filter @keyboard-studio/studio test     # projection, checklist, hooks
pnpm typecheck && pnpm lint
```

## Scenario 1 — US1: fresh help page carries the standard header

1. `pnpm dev`; create a net-new keyboard named "Hausa Basic"; answer the Phase F
   description; reach Output and download the source `.zip`.
2. Open `source/help/hausa_basic.php` — it begins with the
   [standard header](contracts/help-header.md) naming
   `'Hausa Basic Keyboard Help'`, followed by the same body as
   `source/welcome/welcome.htm` (parity).
3. Early-download variant: skip Phase F, download — header still present above the
   placeholder body; Output checklist marks the help row placeholder.

Automated: `helpDocsRender.test.ts` header cases +
`serializeWorkingCopy.stubCompletion.test.ts` extension.

## Scenario 2 — US2: folder-convention welcome survives adaptation

1. Adapt a folder-convention base (e.g. `ahom_star`: `source/welcome/welcome.htm` +
   6 images); produce a package.
2. Confirm the output contains `source/welcome/welcome.htm` (answers appended below
   the merge boundary) and every image; the `.kps` `<Files>` lists each as
   `welcome\...` and `<Options><WelcomeFile>` is `welcome\welcome.htm`; no flat
   `source/welcome.htm` exists.
3. Flat-convention base variant: base welcome is still found and merged; output is at
   the folder location.
4. Full-corpus sweep (SC-002): `node utilities/welcome-sweep/run.mjs` (offline, walks
   `../keyboards`, asserts welcome + 100% images carried and listed for every
   folder-convention base). Not part of default CI.

## Scenario 3 — US3: Output checklist informs, never blocks

1. Reach Output with the HISTORY proposal dismissed: checklist shows six rows, HISTORY
   marked placeholder, others show their tier.
2. Activate the HISTORY row → lands on the Phase F history screen; confirm → return to
   Output → row shows authored, marker gone.
3. With any placeholder combination, both the `.kmp` download and community submission
   remain enabled (automated regression: `OutputScreen` test downloads with all rows
   on placeholder).

## Scenario 4 — US4: base classification + adaptive description

1. In choose-base, focus a fully documented base → card shows "documentation: full";
   at the Phase F description, the base's description is prefilled — one confirm
   completes the step (SC-005).
2. Focus a base with no welcome/help → "documentation: none"; description required as
   today. Track 1 copy of a full base: description required, no base prose prefilled.

## Scenario 5 — US5: HISTORY proposal

1. Adapt a base, add two characters via a mechanism, reach the Phase F history screen:
   the proposal lists the base and the additions under `## <version> (<date>)`.
2. Edit a bullet, confirm, produce: `HISTORY.md` top entry carries the edited bullets +
   the "Adapted from" bullet; base entries preserved below.
3. Dismiss instead: stub ships; Output marks HISTORY placeholder.

## Scenario 6 — US6: layout charts

1. Net-new keyboard with default+shift desktop layers and a phone touch layout;
   produce twice.
2. `source/welcome/` holds `ks-layout-desktop-default.svg`,
   `ks-layout-desktop-shift.svg`, one `ks-layout-phone-<layer>.svg` per touch layer;
   the welcome page's "Keyboard Layout" section references each; the `.kps` lists
   each; both productions byte-identical (SC-004, automated round-trip test).
3. Legibility fixture (SC-008): keyboard with a combining mark, a no-glyph character,
   and an empty key — chart draws dotted-circle carrier, `U+XXXX`, and distinct empty
   treatment respectively (SVG snapshot test).
4. Adaptation of an image-shipping base: base images kept, no generated chart unless
   the author opts to regenerate.

## Scenario 7 — US7: documentation findings

1. Produce a package; hand-edit HISTORY so its top version disagrees with the keyboard
   version (test harness mutates the store): exactly one warning names both versions,
   points at HISTORY.md, carries a hint; download/submit still proceed.
2. SC-007 sweep (automated): every FR-019 row fires on its broken fixture, stays
   silent on the clean fixture; the bijection test proves every `lintRuleId` has an
   emitting check.
3. Upstream case: adapt a base whose own docs carry a finding — it renders muted and
   is excluded from the summary count until the member is edited.

## E2E

Extend `packages/studio/e2e/copy-edit.spec.ts` (the template walk): assert the
downloaded artifact contains all six members with the welcome page at the folder path,
and the checklist is present on Output. Local Playwright setup per the repo's
known-good global-install + junction procedure.
