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

## D8 — Tier B seam: id derivation, extractor location, loader fallback (T026)

**Resolved 2026-07-23.** Reviewed once by km-domain (linguistic lens) and once
by km-synthesis (integration-fit lens); both review passes caught real errors
in the first draft, folded in below. This is an engine-side proposal standing
in for one half of Article VI's bilateral "joint session" — not a substitute
for the content team's own sign-off, but the decision the engine side needs to
start T027.

### Scope: only fields that actually render, today

Per-field render-site verification (not just schema presence):

| Field | Renders today? | Evidence |
|---|---|---|
| `Pattern.title` | **Yes** | `packages/studio/src/lib/irToCarveNodes.ts:625,860,1210` (carve-node label) |
| `Pattern.description` | Not yet | schema-present, spec-intended, no call site found |
| `Pattern.questions[].prompt` / `.options[].label` | Yes (survey render path) | rendered wherever `PatternQuestion` drives a survey step |
| `AdaptationQuestion.provenanceLabel` | **Yes** | `packages/studio/src/survey/Prefill.tsx:55` |
| `AdaptationQuestion.elicits` | **No** | only consumed by tests (`firing.us1.test.ts`, `trustPolicy.test.ts`) — dev-facing gloss, not end-user copy |
| `Criterion.description` | Not yet | no render call site found in studio/engine |
| `Criterion.preSubmitChecklistText` | Not yet | same |
| `Criterion.section` | Candidate, unconfirmed | reads as real heading prose but no render site confirmed either — verify before adding |
| Pattern extended metadata: `notes`, `notes_extended`, `skeleton.note`, `skeleton.description`, `skeleton.parameters[].description`, `provenance[].note`, `demo.sample_output`, `demo.sample_keys[].note`, `frequency_in_corpus` | **No — excluded** | `notes`/`notes_extended`/`skeleton.*` are dropped entirely by `toPattern()` (`packages/contracts/src/schemas.ts`, never copied into the runtime `Pattern`); `provenance[].note`/`demo.*`/`frequency_in_corpus` survive the loader (passthrough) but have zero render call sites outside `schemas.test.ts` — internal pattern-authoring documentation, not studio-end-user copy |

**Decision**: T027's initial extraction allowlist covers only the
confirmed-rendering rows (`title`, `questions[].prompt`/`.options[].label`,
`provenanceLabel`) plus the two "not yet wired but spec-intended" fields
(`Pattern.description`, `Criterion.preSubmitChecklistText`) — **excluding**
`elicits` and all nine extended-metadata fields. Re-add any of these the
moment a real render site lands. `Criterion.section` is deferred pending a
render-site check.

### Frozen literals inside otherwise-translatable prose

Several in-scope-adjacent prose fields interleave genuine instructional
English with literal data that must never be translated or reordered:
Unicode codepoint notation (`U+0301`), virtual-key tokens (`K_QUOTE`), literal
example-character runs mid-sentence (`"Example: aeiouAEIOU"` —
`content/patterns/desktop-input/deadkey-single-tap.yaml:34,44-46,176`), and
`criteria.json`'s candidate `section` field embedding a literal backtick-quoted
filename (`` `LICENSE.md` ``). No extraction-time tooling can reliably
auto-detect these — unlike Tier A's `${{ name }}` interpolation, there's no
placeholder convention to hook into. **Decision**: handle via a
translator-context note (same "Translator context for ambiguous ids" table
convention `docs/i18n-spike.md` already uses for T036), not a per-string lint
check — a standing rule to "preserve exactly: `U+XXXX`, `K_*`/`U_*` tokens, and
literal example-character runs" for every Tier B string containing them.
Tracked as a T027-adjacent follow-up.

### ID derivation

Reuse the Tier A `area.component.thing` dot convention, rooted under
`content.`, using each record's own stable `id` as the namespace segment:
`content.pattern.<patternId>.title` / `.description`,
`content.pattern.<patternId>.question.<questionId>.prompt`,
`content.pattern.<patternId>.question.<questionId>.option.<value>.label`,
`content.adaptationQuestion.<id>.provenanceLabel`,
`content.criteria.<criterionId>.description` / `.checklistText` (the key
intentionally shortens `Criterion.preSubmitChecklistText` — the `preSubmit`
prefix is redundant once the segment already reads `content.criteria.<id>`).

Criterion ids already embed literal dots (`4.3-copyright-holder-is-authorized`),
ambiguous against the project's `area ("." segment)+` id grammar if a key is
ever parsed by splitting on `.`. **Decision**: when a record id contains
literal dots, replace them with `_` when forming the catalog-key segment only
(`content.criteria.4_3-copyright-holder-is-authorized.description`) — the
original `id` field is unaffected; the catalog key stays a flat, opaque,
never-decomposed string. The same rule applies to the `<value>` segment in
`...option.<value>.label` above — option values aren't schema-guaranteed to be
dot-free, so they're slugified identically (both are implemented via one
shared `slugifyIdSegment` helper in the T027 extractor, not two copies of the
rule). This composite-key convention is distinct from
`adaptation-catalog-lint`'s existing colon-separated `namespace:slug`
convention for `consumers` entries (`utilities/adaptation-catalog-lint/index.js:249`)
— don't conflate the two.

### Scope correction: `survey/questions/b/*.ts` is Tier A, not Tier B

These 63 files (`packages/studio/src/survey/questions/b/*.ts`) are TS source
under `packages/studio` — Tier A territory by Article VI's directory-based
split — not YAML content records. **Zero of the 63 currently have any i18n
coverage** (confirmed via grep — no `Trans`/`useLingui`/`@lingui` hits). They
were excluded from T016's chrome sweep under "do NOT touch Tier B text sourced
from content/ YAML records," but that instruction doesn't actually describe
these files. **Decision**: file a Tier A follow-up issue to convert them with
`<Trans>`/`t()` under a `survey.b.<id>.*` namespace, same as any other studio
chrome — keeps the sidecar extractor scoped to genuine YAML/JSON records.

### Extractor location & shape (T027)

New tool at `utilities/i18n-content-extract/`, following the `facet-index`
convention (own `package.json`, `"type":"module"`, `tsx`-run) rather than the
plain-node convention (`i18n-catalog-lint`/`adaptation-catalog-lint`), since it
needs `PatternSchema`/`CriterionSchema` from `@keyboard-studio/contracts`
(both defined in `schemas.ts` and re-exported at `packages/contracts/src/index.ts:35`)
so the prose/control split is defined once and can't drift from the runtime type.

`utilities/*` is excluded from the pnpm workspace (`pnpm-workspace.yaml`,
except `oauth-backend`), so `facet-index` reaches `@keyboard-studio/contracts`
via a **dual path alias**, not a normal package dependency: a `tsconfig.json`
mapping straight to `../../packages/contracts/src/index.ts` (resolved by `tsx`
at runtime), duplicated by hand in `vitest.config.ts` (Vitest doesn't read
tsconfig `paths`). `i18n-content-extract` must reproduce both alias entries.

Per record type, a fixed allowlist of field paths (the confirmed-rendering set
above) is walked and flattened into
`content/i18n/en/{patterns,adaptationQuestions,criteria}.json` using the D8 id
scheme. Supports `--check` (build in-memory, diff against committed, exit
nonzero, never write) for T031's drift-gate wiring — mirrors `facet-index
--check` and `i18n-catalog-lint`'s never-touch-the-committed-file rule.

### Loader / resolution semantics (T028)

Don't localize the loaders or the `Pattern`/`Criterion` objects — they keep
producing English-only records exactly as today, zero signature changes.
`browserPatternLibrary.ts`, the engine pattern loader, and `criteriaData.ts`
are eager, singleton, module-init-time constructs with no locale parameter in
scope (`criteriaData.ts`'s `ALL_CRITERIA` isn't even a function, and the
engine package has no locale concept today); threading locale through them
would break existing zero-arg call sites (`StudioShell.tsx`, `services.ts`,
`MechanismGallery.tsx`, `serializeWorkingCopy.ts`, `localBaseBrowser.ts`,
`patternIds.ts`) and freeze content to whichever locale was active at first
module evaluation.

**Decision**: resolution happens at the **render call site** instead — the
same place Tier A's `resolveMessage(i18n, descriptor)` is called per-render
against the live `i18n` instance (`packages/studio/src/lib/i18nResolve.ts:17-27`)
— same fallback *philosophy* (locale absent/untranslated → fall back to the
English value already in hand, never blank), different shape (a locale-keyed
sidecar-JSON lookup by a `(type, id, field)` triple, not a Lingui
`MessageDescriptor`). A small helper — `resolveContentString(locale, type, id,
field, englishValue)` — looks up `content/i18n/{locale}/{type}.json`, falling
back to `englishValue` on any miss. Called directly at each existing render
site of an in-scope field (e.g. `irToCarveNodes.ts:625`, `Prefill.tsx:55`) —
same as `t()`/`<Trans>` replacing raw English at Tier A chrome sites, just
sourcing from the sidecar instead of a Lingui macro. Target-locale sidecar
files load the same lazy/code-split way as Tier A per-locale catalogs (D6).
