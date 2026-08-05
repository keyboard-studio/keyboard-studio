# Quickstart: validating the MVP authoring walk (034)

Runnable validation scenarios that prove 034's acceptance criteria. Detail lives in [contracts/](contracts/) and [data-model.md](data-model.md); this is the run guide.

## Prerequisites

```bash
pnpm install
pnpm build            # runs prebuild codegen (langtags, recognizer rules); compiler wasm ships in @keymanapp/kmc-kmn
```

Run the studio for manual walk-throughs:

```bash
pnpm dev              # engine watch + studio Vite dev server
```

## Scenario 1 — Desktop walk to ZIP, Latin (US1, SC-001)

**Automated (extends the existing E2E):**

```bash
cd packages/studio && npx playwright test copy-edit.spec.ts
```

Expected: the walk imports a base, copies it (Track 1), declares an alphabet, carves, places letters, locks desktop, and the downloaded `.zip` contains a `.kmn`/`.kvks`/`.kps` that passes Layer A/B and compiles via the kmcmplib oracle.

## Scenario 2 — Desktop walk to ZIP, non-Latin alphabetic (US1, SC-004)

Add/extend an E2E that runs the same walk against a **Cyrillic** base (proven set: Latin/Cyrillic/Greek/Georgian/Armenian).

Expected: identical fidelity to Scenario 1; the emitted keyboard carries the correct BCP47 script subtag and compiles.

## Scenario 3 — Track 2 (adapt) against the real engine (US1, FR-004, TI-2)

Run the walk choosing **Track 2 (adapt)** with the real engine (not the mock).

Expected: a live working copy is instantiated (identity preserved, no `project_name` step), and the reducer does NOT hit the mock-only `console.warn "Track 2 skipped"` path.

## Scenario 4 — Spine reaches touch + both publish paths (US2, SR-3, PP-1..PP-3)

Manual or E2E:

1. Complete the desktop walk; confirm the flow advances into the **touch** stage (not terminating at desktop).
2. On the output screen, confirm **both** a working ZIP download and a **submit-as-PR** affordance are present.
3. With the OAuth backend unset (`VITE_OAUTH_BACKEND_URL` absent), confirm the PR affordance shows "unavailable" and ZIP still downloads a valid keyboard.

## Scenario 5 — Save and resume across reload (US3, SC-003)

**Automated (new integration/E2E):**

1. Start a walk, instantiate a working copy, advance to (say) the carve stage, make a removal.
2. Hard-reload the page.
3. Assert: the app re-enters the **carve** stage with the working copy (IR + inventory + the removal) restored — NOT reset to `identity`.
4. Continue, make another edit, reload again — assert the second edit persisted.
5. Trigger **start over**; reload — assert a fresh start at `identity` (draft cleared).

**Unit coverage** (`draftPersistence` per [contracts/persistence.md](contracts/persistence.md)):

```bash
pnpm --filter @keyboard-studio/studio test draftPersistence
```

- `saveDraft` no-ops with no instantiation (VR-2).
- `loadDraft` returns false + clears on version mismatch (VR-1) and on malformed JSON (VR-3).
- Round-trip: save -> load restores VirtualFS (Base64), Sets, and re-derives `removalCapabilities`/`session`.
- `clearDraft` removes the key; quota failure on write does not throw (VR-4).

## Scenario 6 — Gated script stub (FR-012, SR-4)

Select Ethiopic / CJK / Hangul at identity.

Expected: routes to the "not supported" terminal stub before base resolution; the gallery is never silently emptied.

## Full suite

```bash
pnpm typecheck
pnpm test
pnpm lint
cd packages/studio && npx playwright test copy-edit.spec.ts
```

## Out-of-scope reminders (do not test as 034 acceptance)

- Touch-layout **derivation depth** (import-and-adapt / reseed) — owned by [035](../035-mobile-touch-derivation/spec.md).
- PR/OAuth **internals** — owned by [024](../024-option-a-github-app/spec.md).
- Arabic/Hebrew/Devanagari end-to-end quality (FR-013, deferred).
- An explicit desktop-lock button (FR-006, deferred).
