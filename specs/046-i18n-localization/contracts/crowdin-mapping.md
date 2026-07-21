# Contract — Crowdin mapping & drift gate

## `crowdin.yml` (repo root)

- **Credentials**: env vars only (`CROWDIN_PROJECT_ID`, `CROWDIN_PERSONAL_TOKEN`)
  — never committed. CI secrets in practice.
- **Two file groups, never merged** (Article VI team split):
  - **Tier A (active, engine team)**:
    `packages/studio/src/locales/en/messages.json` →
    `…/%two_letters_code%/messages.json`, `skip_untranslated_strings: false`
    (every key present in every locale; runtime falls back via id).
  - **Tier B (deferred, content team)**: `content/i18n/en/*.json` →
    `content/i18n/%two_letters_code%/…` — commented scaffold until P2 lands the
    extractor. Do **not** point Crowdin at raw `content/**/*.yaml` or
    `criteria.json` (leaks control fields).
- **Locale tokens**: `%two_letters_code%` while targets are language-only; switch
  to `%locale%` when a region target (`pt-BR`) is added (P3).
- **Round-trip**: `crowdin upload sources` (CI on merge to main) →
  `crowdin download` (scheduled/webhook) opens a translations PR through the
  existing km-triage merge gate. Build-time only — no runtime client.
- **Offline validation**: none (every CLI command authenticates); the first live
  check is `crowdin upload sources --dry-run -b main` once credentials exist.

## Drift gate — `utilities/i18n-catalog-lint`

- **Wiring**: `pnpm run i18n-catalog-lint`, included in `pnpm lint` (so CI's lint
  step enforces it — no `ci.yml` change).
- **Mechanism**: extracts a fresh catalog into a temp dir (via the config's
  `LINGUI_CATALOG_CHECK_DIR` override) and compares — **read-only**, never mutates
  committed catalogs.
- **Failure conditions**:
  - source (`en`) catalog differs in **keys or values** (added/removed string, or
    edited English under an unchanged id);
  - a target locale's **key set** drifts from source (unpropagated string);
  - a committed locale not in `lingui.config` (orphan).
- **Fix**: `pnpm --filter @keyboard-studio/studio messages:extract`, then commit.
- **Exit**: `0` + `[OK] … in sync` when clean; `1` + `[ERROR] …` + the offending
  ids when drifted.
