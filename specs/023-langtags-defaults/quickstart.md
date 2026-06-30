# Quickstart / Validation: SIL langtags defaults

Validates the feature end-to-end against the spec's Success Criteria. Run from repo root.

## Prerequisites

- `pnpm install` done; Node ≥ 20.
- `scripts/langtags-version.json` pinned with the real SHA-256 (computed at pin time).

## 1. Build the data foundation (FR-001, FR-002, FR-010, FR-012 / SC-006)

```bash
pnpm run fetch-langtags      # downloads + SHA-256-verifies source/langtags.json; retains MIT notice
pnpm run codegen-langtags    # regenerates packages/engine/src/langtags/generated/*
pnpm build                   # prebuild runs both, then builds all packages
```

Expected: `[OK]` lines; vendored file under `packages/engine/data/langtags/` with its LICENSE/NOTICE;
generated index present. Corrupt the pinned SHA-256 and re-run `fetch-langtags` → it exits non-zero with
`[ERROR] SHA-256 mismatch` (FR-012). Re-running `codegen-langtags` twice yields byte-identical output.

## 2. Engine lookup API (FR-002, FR-003 / SC-004)

```bash
pnpm --filter @keyboard-studio/engine test src/langtags
```

Expected: contract tests C1–C9 pass — `ha`→Latn/NG, `hi`→Deva/IN, `hau`→same as `ha`, `HA`
case-insensitive, unknown→`null`, `lookupByName` matches by code/englishName/autonym.

## 3. Start-of-survey behavior (FR-004..FR-009 / SC-001, SC-002, SC-003)

```bash
pnpm dev    # engine watch + studio Vite dev server
```

In the survey identity step:
- Type "Hausa", "ha", or the autonym in the language field → matching languages are offered (SC-004).
- Select Hausa → target script pre-proposed **Latin**, region pre-proposed **Nigeria** (NG), autonym
  and English name pre-filled — each shown as an editable field captioned "Suggested from langtags"
  (SC-001, SC-002). None appears blank; none is locked.
- Change the proposed script to "Latin romanization" / "IPA" → the override sticks (FR-004 decoupling).
- Enter a language **not** in langtags → every field accepts free text and the step completes; no false
  proposal appears (SC-003 / FR-008, FR-009).

## 4. Payload check (FR-011 / SC-005)

```bash
pnpm --filter @keyboard-studio/studio build
```

Expected: the langtags slim index is emitted as its **own chunk** (dynamic import), not folded into the
main entry chunk; the raw `langtags.json` is absent from `dist/`.

## 5. Gates

```bash
pnpm typecheck && pnpm lint   # includes depcruise boundary checks
pnpm -r test
```

Expected: all green; no new dependency-cruiser boundary violation (studio→engine import is allowed;
engine does not depend on studio).
