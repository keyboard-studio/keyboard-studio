# Phase 1 Data Model — i18n localization

Localization adds **no** entities to the locked contracts (`Pattern`,
`Criterion`). These are the data shapes the feature introduces around them.

## Message catalog

A per-locale map of message id → text. One file per locale.

- **Path**: `packages/studio/src/locales/{locale}/messages.json` (Tier A);
  `content/i18n/{locale}/*.json` (Tier B, P2).
- **Shape** (minimal JSON): `{ "<messageId>": "<text>" }`.
- **Source locale (`en`)**: `text` is the English source (the fingerprinted
  value). **Target locale**: `text` is the translation, or `""` when untranslated.
- **Invariants**:
  - Every target catalog has the **same key set** as the source (enforced by the
    drift gate).
  - Missing/empty translation → runtime falls back to the English source via the id.
  - Compiled catalogs (`messages.js`) are build artifacts, never committed.

## Message id

A stable, explicit, namespaced identifier — the durable identity.

- **Convention**: `area.component.thing` (e.g. `welcome.title`,
  `output.submit.button.submit`, `nav.language`).
- **Rules**: stable across English edits (never renamed casually — a rename
  orphans translations); lowercase dot-segments; `area` names a UI region.
- **Relationship**: one id → one source value (en) → zero-or-one translation per
  target locale.

## Locale

A selectable UI language.

- **Registry**: `SUPPORTED_LOCALES` in `lib/i18n.ts` (`{ code: autonym }`, e.g.
  `{ en: "English", fr: "Français" }`). `DEFAULT_LOCALE = "en"`.
- **Resolution order** (`resolveInitialLocale()`): saved (`ks.locale`) →
  `navigator.language` primary subtag → `DEFAULT_LOCALE`.
- **Region tags** (P3): `pt-BR` resolves exact → base language (`pt`) → English.
- **Persistence**: `localStorage["ks.locale"]`, guarded (SSR/private-mode/Node≥22
  shadow safe), written on switch.

## Sidecar content catalog (Tier B, P2)

A generated flat catalog derived from a content-team record.

- **Source of truth**: the content record (YAML/`criteria.json`) — the extractor
  reads it; translators never see it.
- **Contains**: only translatable prose (`title`/`description`/`prompt`/`elicits`/
  `provenanceLabel`; criteria `description` + `checklistText`), keyed by a stable
  id derived from the record's own id + field path.
- **Excludes**: all control fields (`id`, `answerType`, `default`,
  `firingCondition`, BCP47 tags, `lintRuleId`, category/priority/…).
- **Criteria sidecar**: `content/i18n/{locale}/criteria.json` is a flat
  `content.criteria.<id>.description` / `.checklistText` map (148 + 10 = 158
  keys) — **never parsed as a `Criterion[]`**. The canonical English
  `criteria.json` stays the sole input to `ALL_CRITERIA`; its parse-parity and
  four-band partition invariants are unchanged, and no test asserts a literal
  row count. *(Restated 2026-07-30: the original `criteria.<lang>.json` +
  `CriterionSchema` shape was superseded by the D8 seam decision and never
  built — see [research.md](research.md) D7/D8.)*

## Drift signal

Not a stored entity — a *derived condition*: a source-value change under an
unchanged id. Surfaced by the CI drift gate (repo side) and Crowdin
approval-reset (TMS side). A target key-set mismatch is the target-side analogue.
