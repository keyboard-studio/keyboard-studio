# Phase 0 Research — i18n localization

No `NEEDS CLARIFICATION` remain: the spec's Clarifications session (2026-07-20)
settled the open questions, and the P1 spike validated them empirically. This
consolidates the decisions with rationale and rejected alternatives.

## D1 — Framework: Lingui v6 with explicit IDs

- **Decision**: Lingui v6, authoring with **explicit** message ids
  (`<Trans id="area.thing">…</Trans>`, `t({ id, message })`).
- **Rationale**: Explicit ids give stable identity so a translation survives an
  English tweak; the Lingui macro *extracts the message from source*, so the
  English catalog cannot silently desync from the code (the failure mode that
  would blind drift detection). Small runtime, ICU plurals, first-class Vite +
  TS support.
- **Alternatives rejected**: **i18next** — hand-maintained English values (they
  rot, blinding drift detection). **Lingui generated ids** — break stable keys on
  every English tweak. **FormatJS/react-intl** — comparable, but Lingui's macro
  extraction + Vite plugin fit this stack more directly.

## D2 — Catalog format: minimal flat JSON

- **Decision**: `@lingui/format-json` `style: "minimal"` → `{ "<id>": "<text>" }`.
- **Rationale**: The one format where id → Crowdin string key and English →
  fingerprinted value line up with Crowdin's native key-value JSON handling —
  which is what makes English-drift-under-a-stable-id detectable. Verified in the
  spike: `en/messages.json` carries English as the value; `fr` carries the same
  keys with translations.
- **Alternatives rejected**: **PO** (`msgid` = source, so a stable id decouples
  the source from Crowdin's key → drift invisible). **JSON `style: "lingui"`**
  (nested `{message,translation}` — muddies value-fingerprinting; needs extra
  Crowdin schema config).

## D3 — Drift detection: on the value, enforced two ways

- **Decision**: English lives as the catalog value; drift is caught by (a)
  Crowdin's approval-reset on a source-value change and (b) a repo-side CI gate
  (`utilities/i18n-catalog-lint`) that re-extracts to a temp dir and fails if the
  committed `en` catalog differs in keys or values, or a target's key set drifts.
- **Rationale**: Recovers the signal a stable-id scheme would otherwise hide,
  without discarding the translation (Crowdin keeps it, flagged "needs review").
  The gate is read-only (temp-dir extraction), so it is safe in `pnpm lint`.
- **Alternatives rejected**: a bespoke source-hash sidecar (Crowdin already does
  this TMS-side; the gate + `git diff` cover the repo side). Mutating-tree check
  (dirties the working copy — a known local footgun).

## D4 — Content strings (Tier B): sidecar extraction, not raw-record mapping

- **Decision**: Extract translatable prose from content records into flat
  `content/i18n/{locale}/*.json` catalogs and point Crowdin at those; keep the
  YAML/JSON records as the content team's source-of-truth.
- **Rationale**: Crowdin's generic parser translates *every* string value; the
  records interleave translatable prose with control fields (`id`, `answerType`,
  `default`, `firingCondition`, BCP47 tags, `lintRuleId`) at several nesting
  levels — a raw mapping would send control fields to translators.
- **Alternatives rejected**: point Crowdin at raw `content/**/*.yaml` /
  `criteria.json` (leaks control fields; verified against a real pattern YAML).

## D5 — Build-time, not runtime

- **Decision**: Committed JSON catalogs bundled by Vite; no runtime Crowdin API
  client in the shipped SPA.
- **Rationale**: The Studio ships as a static bundle and authors in an in-memory
  VirtualFS; a runtime client would need a browser token and network on load.
  The JS API client is reserved for a possible future in-app "suggest a
  translation" feature only.

## D6 — Provider ownership + locale bootstrap

- **Decision**: `StudioShell` owns the `I18nProvider`. Bootstrap loads `en`
  synchronously (always-available fallback), then applies
  `resolveInitialLocale()` = saved (`ks.locale`) → `navigator.language` → `en`;
  non-source locales are code-split and lazily activated.
- **Rationale**: One provider covers the running app and the ~40 direct-render
  component tests without wrapping each call site. Sync `en` avoids a first-paint
  fetch; a brief English flash for a non-English returning visitor is acceptable
  at this stage (P3 can pre-resolve to remove it).
- **Alternatives rejected**: provider in `main.tsx` only (tests bypass it);
  fully-async initial activation (first-paint fetch gate).

## D7 — `criteria.json` schema/count protection

- **Decision**: localized `criteria.<lang>.json` must satisfy `CriterionSchema`;
  the 148-row count test keeps reading only the canonical English file.
- **Rationale**: The count is a machine-enforced contract; localized copies are
  translations of `description`, not new rows, and must never be counted.

## Open coordination item (not a blocker for P1)

Tier B's extraction tooling is an **engine↔content seam** (Article VI). Before P2
starts it needs a joint session to agree: the per-string id derivation from a
record, where the extractor lives (`utilities/`), and how the studio/engine
loaders resolve a localized value with English fallback. Recorded here so P2
planning does not skip it.
