# Phase 0 Research: SIL langtags defaults

All Technical Context unknowns were pre-resolved before planning; this records the decisions.

## D1 — License & vendoring

- **Decision**: Vendor `langtags.json` directly into the repo (build input), retaining the upstream MIT
  notice.
- **Rationale**: Upstream is MIT (`Copyright (c) 2019-2025 SIL International (http://www.sil.org)`),
  which permits redistribution provided the copyright + permission notice is retained. Vendoring (vs.
  runtime fetch) matches the repo's determinism principle (kbgen: "an upstream bump must not silently
  move a value") and keeps authoring offline (Constitution V).
- **Alternatives considered**: runtime fetch from `ldml.api.sil.org` (rejected — non-deterministic,
  network dependency during authoring); git submodule (rejected — heavier than a pinned single file).

## D2 — Pin target & integrity

- **Decision**: Pin `source/langtags.json` at commit `99b856bbe8a7dfc1ef7f05d6087dc7501843eb04`
  (master, 2026-06-25); record a SHA-256 in `scripts/langtags-version.json`; verify on fetch.
- **Rationale**: The repo cuts no release tags and stores its own `_version` record inside the JSON, so
  a commit SHA is the stable pin. SHA-256 verification mirrors `fetch-kmcmplib.mjs` and satisfies
  FR-012 (fail loudly). Raw URL: `https://raw.githubusercontent.com/silnrsi/langtags/<sha>/source/langtags.json`.
- **Note**: upstream `tag`/`full` values are not stable across versions, but equivalence **sets** are;
  acceptable because every derived value is an editable proposal, not a locked decision.

## D3 — Do not ship the raw dataset to the browser

- **Decision**: Codegen a compact slim index at build time; the browser loads only that, via dynamic
  `import()` so it is a separate chunk.
- **Rationale**: Raw `langtags.json` is ~5.4 MB; bundling it would bloat the SPA. The studio needs only
  a few fields per language (FR-002) plus a flat summary list for search (FR-003). FR-011/SC-005.
- **Alternatives considered**: ship raw JSON + parse client-side (rejected — payload + parse cost);
  server API (rejected — no backend; VirtualFS/offline authoring model).

## D4 — Index derivation rules

- **Decision**: For each tagset whose `tag` is a bare language subtag (no script/region), derive the
  default record from its `full` tag: `defaultScript` = script subtag of `full`, `defaultRegion` =
  region subtag of `full`; carry `regions`, `localname` (autonym), `name` (English), `iso639_3`. Index
  under both the 2-letter `tag` and `iso639_3` (and `iso639_3extra` where present). Emit a flat
  `languages[]` summary (`code`, `name`, `localname`, `defaultScript`) for the autocomplete.
- **Rationale**: The bare-subtag tagset's `full` is langtags' canonical default orthography for the
  language (per doc/langtags.md). Dual-keying lets both `il_language_code` ("ha"/"hi") and `iso_code`
  ("hau"/"hin") resolve.
- **Alternatives considered**: index every tagset including script-qualified ones (rejected for the
  default lookup — we want *the* default; script-qualified sets are reachable via the user's explicit
  script choice, preserving §8/§9 decoupling).

## D5 — Provenance display (propose-then-confirm)

- **Decision**: Add a parallel `getSeedProvenance(questionId)` to the existing seed mechanism; the
  runner renders a small caption ("Suggested from langtags — edit if needed") under seeded fields.
- **Rationale**: Reuses the proven forward-seed path
  ([IdentityLite.tsx](../../packages/studio/src/survey/IdentityLite.tsx) `getSeedValue` /
  `onAnswerCommit`) and satisfies FR-007 / specs/002 FR-010 (visible source, overridable) without
  building the full `axisFills` record (specs/002 US5, out of scope).
- **Alternatives considered**: a new Pattern-schema `defaultSource` field (rejected — locked-contract
  change reserved for the #5/#5b joint session; specs/002 explicitly avoids it).

## D6 — Autonym/English-name proposal placement (the one open implementation choice)

- **Decision (recommended)**: keep the conservative path for this pass — seed autonym/English where the
  language code is already known (identity-lite captures the selection; dependents seed forward), and
  keep free-text entry. A fuller "language-picker-first" redesign of the identity head is a possible
  enhancement but is **not** required by any FR/SC and is left to implementation discretion / a later
  pass.
- **Rationale**: Preserves the existing naive-user path (autonym-first, by name they know) while still
  delivering FR-005/FR-007/FR-008. Lower regression risk than reordering the identity flow.
- **Alternatives considered**: make the first question a langtags picker that seeds everything
  (better single-shot UX, larger flow change + more fixtures) — viable follow-up, deferred.

## D7 — Free-text fallback for the autocomplete

- **Decision**: The language autocomplete MUST allow a free-text "not in list" entry so unlisted
  languages complete the step (FR-009, US3). Confirm the existing autocomplete widget supports a
  free-text escape; if not, the wiring adds one.
- **Rationale**: A defaults source must never gate completion (SC-003).
