# Quickstart: validating spec 081

Run everything from the repo root unless noted. Build once first (studio typecheck needs the
engine built): `pnpm build`.

## 1. Unit: channel and footer

```
pnpm --filter @keyboard-studio/studio exec vitest run src/stores/stepNavStore src/hooks/usePublishStepNav src/components/StudioFooter
```

Expected results:

- The store tests cover publish, the identity no-op, owner-checked clear, the one-publisher
  error, and reset (FR-050).
- The footer a11y suite covers the group role and label, slot order, disabled state and
  description, nav before dots in Tab order, and exactly one `role="status"` (FR-052).

## 2. Unit: per-step parity

```
pnpm --filter @keyboard-studio/studio exec vitest run src/survey src/editors src/adaptation src/tests/steps
```

Expected: every Appendix A row's existing tests pass through `withStepNav` with unchanged
assertions (FR-010 and FR-051; baseline method in [research.md R-11](research.md)). The golden
walk (`stepHost.goldenWalk.test.tsx`) and the render-smoke direct-parent contract pass.

## 3. Transition and duplicate checks (US3, SC-005)

The transition test drives each adjacent step pair forward, back, and by footer-dot jump. After
each hop it asserts that:

- `within(footer).getAllByRole("button")` minus the dots contains only the new step's handles;
- `getAllByRole("button", { name: /^(← )?Back$/ })` has a length of at most 1.

## 4. E2E

```
pnpm --filter @keyboard-studio/studio exec playwright test
```

Expected: green. The only diffs are the Appendix B selector scoping (for example
`footer.getByTestId("progress-dot-row").locator("button").first()`) and the BaseResolution
placement assertion, which is rewritten to assert placement in the footer (FR-053).
`footer-progress.spec.ts:120` runs axe over the cluster (SC-009).

## 5. Layout (US6, SC-006, SC-007)

Using Playwright (see the project memory "manual walks via Playwright"), load the touch
per-character gallery, which has the longest label set, at widths of 1600, 1024, 768, 530 and
375.

- Under the default (fine) pointer: the footer `boundingBox().height === 40`.
- With `hasTouch` and a coarse-pointer emulation: the height is at most 52.
- Every nav button has `scrollWidth <= clientWidth`, which means no clipping.
- The `[data-progress-dot-kind="current"]` element intersects the row's viewport.
- At 375 px the project label is hidden, and `document.documentElement.scrollWidth <=
  innerWidth`.

## 6. i18n

```
pnpm run i18n-catalog-sort && pnpm run i18n-catalog-lint
```

Switch the studio to `fr` and open Carve. The expected labels are `← Retour`, `Passer` and
`Continuer →`, and `Chargement du clavier…` while the keyboard loads.

## 7. Manual keyboard walk (FR-054)

Follow the rule 12 walk in [docs/accessibility.md](../../docs/accessibility.md) on both tracks'
golden paths with the mouse untouched. Record in
[wcag-2.2-aa-tracker.md](../056-ada-accessibility/wcag-2.2-aa-tracker.md), for rows 2.4.3,
2.4.11, 2.5.8, 3.2.3 and 3.2.4, with annotations on 1.4.10 and 2.4.1:

- the date;
- the result;
- whether the in-body "why blocked" hint was noticeable from the footer (FR-042).
