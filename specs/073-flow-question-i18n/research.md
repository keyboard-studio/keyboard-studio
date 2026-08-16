# Research: Flow-Question Content i18n

No `[NEEDS CLARIFICATION]` markers were left in the Technical Context — every decision below had a direct precedent in spec 046 (specs/046-i18n-localization/) to follow rather than re-derive. This file records the handful of feature-specific decisions that precedent didn't fully settle.

## D1 — Extraction reads live TS module registries, not YAML

**Decision**: `extractFlowQuestionStrings()` imports `packages/studio/src/survey/questions/registry.ts`'s consolidated `questionRegistry` (or the individual phase sub-registries directly — see D2) and reads `.definition.{prompt,label,body,help_text}` plus `.definition.options?.[].label`, keyed by `.definition.id`. This is a real TypeScript module import, not a YAML-parse pass.

**Rationale**: The existing extractor already does this for one of its three types — `extractCriteriaStrings()` (`utilities/i18n-content-extract/extract.ts:138-148`) imports `ALL_CRITERIA` from `@keyboard-studio/contracts` directly rather than parsing a data file. Flow questions have no YAML source at all (they're TS modules per-file under `packages/studio/src/survey/questions/**/*.ts`, registered in per-phase registries) — a real import is the only option, and it's already a proven pattern in this same tool.

**Alternatives considered**: AST-parsing the `.ts` files with `ts-morph`/`typescript` compiler APIs to pull string literals without executing the modules. Rejected: strictly more machinery than a direct import, and the import path is already de-risked (see D3) — nothing in the question-module chain requires a browser or bundler.

## D2 — Import the phase sub-registries directly, excluding `registry.reserve.ts`

**Decision**: The extractor imports `phaseARegistry`, `phaseBRegistry`, `phaseFRegistry`, `phaseGRegistry` (from `registry.a.ts`/`registry.b.ts`/`registry.f.ts`/`registry.g.ts`) and merges them — the same shape `registry.ts` itself builds — but does **not** import `reserveRegistry` (`registry.reserve.ts`).

**Rationale**: `registry.reserve.ts`'s own header states its contents are "demoted/relocated question modules... no live flow uses them" (`packages/studio/src/survey/questions/registry.reserve.ts:12-13`, cross-referencing `content/flows/README.md`'s Leftover section). Extracting and translating ~30 dead question modules would burden translators with text no author ever sees, violating the same "only render-verified fields" discipline spec 046's D8 established for the other three catalogs (`utilities/i18n-content-extract/extract.ts:1-7`).

**Alternatives considered**: Import the consolidated `questionRegistry` from `registry.ts` (which does include `reserveRegistry`) and filter by some "is this question reachable from a live flow manifest" check at extraction time. Rejected as unnecessary complexity — the phase sub-registries already draw exactly this live/reserve line at the source; importing them directly (skipping `registry.reserve.ts`) gets the same result with no new logic.

## D3 — Import-chain safety confirmed (no React/Vite dependency)

**Decision**: No design change needed — the plain-`tsx` extractor tool (outside the pnpm workspace, per CLAUDE.md's "Standalone utilities" note) can safely import the question registries.

**Rationale**: Verified during research: `packages/studio/src/survey/types.ts` (the `FlowQuestion`/`QuestionModule` types every question module and registry file imports) has exactly one import — `@keyboard-studio/contracts` (`types.ts:5`), already a dependency of the extractor. A repo-wide grep of `packages/studio/src/survey/questions/**` for `from "react"`/`from "vite"`/`import.meta` returns hits only in two `*.test.ts` files (never imported by the registries themselves). The registry chain (`registry.ts`, `registry.a/b/f/g.ts`, every per-question module) is plain TypeScript with no browser-only dependency.

**Alternatives considered**: A fallback AST-based extraction (see D1) in case the import proved unsafe. Not needed — dropped.

## D4 — Fields extracted per question: `prompt`, `label`, `body`, `help_text`, `options[].label`

**Decision**: Extract all four top-level text fields defined on `FlowQuestion` (`packages/studio/src/survey/types.ts:57-73`) that are ever rendered, plus each option's `label` (`FlowOption.label`, `types.ts:36`) — mirroring exactly the set spec 046 already extracts for pattern questions (`prompt` + `options[].label`, `utilities/i18n-content-extract/extract.ts:85-91`). `FlowOption.note` and `FlowGotoRule`/`options_source`/`next`/`type`/`required`/`engine_resolved`/`advisory` are control fields and excluded, matching the D8 control-field-exclusion discipline.

**Rationale**: `QuestionField.tsx` reads all four fields for display: `labelText = question.prompt ?? question.label ?? question.id` (`QuestionField.tsx:764`), `question.help_text` (`QuestionField.tsx:789`), and the Notice-type fallback chain `question.body ?? question.help_text ?? question.prompt` (`QuestionField.tsx:730`). All three are real render sites today — none can be dropped without leaving a still-untranslated fallback path.

**Alternatives considered**: Extract only `prompt`/`help_text` (the two named in the original bug report) and defer `label`/`body`/`options[].label` to a follow-up. Rejected — the render-site audit above shows all of them are live text today; splitting the fix would just recreate a smaller version of the same gap the moment a question that uses `label`/`body` instead of `prompt` renders untranslated.

## D5 — Catalog key namespace: `content.flowQuestion.<id>.<field>`

**Decision**: Add `"flowQuestions"` to `ContentCatalogType` (`packages/studio/src/lib/contentI18n.ts:22`) with namespace segment `"flowQuestion"` (`NAMESPACE` map, `contentI18n.ts:31-35`) — e.g. `content.flowQuestion.il_language_english.prompt`, `content.flowQuestion.il_language_english.help_text`, `content.flowQuestion.il_language_english.option.<value>.label` for option labels (mirroring the pattern-question option-label key shape at `extract.ts:90`: `content.pattern.<id>.question.<qid>.option.<value>.label`).

**Rationale**: Follows the existing `buildContentKey()` convention (`contentI18n.ts:52-54`) and the `area.segment` id grammar (CLAUDE.md i18n conventions) exactly — no new grammar invented. Flow-question ids are already unique across all live registries (`registry.ts`'s "one import + one entry per question module" invariant, enforced by `registry.test.ts`), so no phase prefix is needed in the key.

**Alternatives considered**: Prefix the key with the phase (`content.flowQuestion.a.il_language_english.prompt`) in case ids collide across phases. Rejected — the registry's own no-duplicate-id invariant already guarantees uniqueness; a redundant phase segment would just make every key longer for no benefit.

## D6 — Render-site wiring uses `resolveContentString`, not a new hook

**Decision**: `QuestionField.tsx` calls `resolveContentString("flowQuestions", question.id, "prompt", question.prompt ?? "", i18n)` (and correspondingly for `label`/`body`/`help_text`/each option `label`), reading the live `I18n` instance the same way Tier A call sites already do via `useLingui()`/`i18n` (see `Prefill.tsx`'s existing `resolveContentString("adaptationQuestions", …)` call for the established pattern).

**Rationale**: This is the exact loader `T028` built (`contentI18n.ts:109-121`) — English fallback when the locale is default, unresolved, or missing the key. No new resolution mechanism is needed; the gap was purely that `QuestionField.tsx` never called it.

**Alternatives considered**: None — this is the established Tier B loader contract; the whole point of this feature is to *use* it here, not build a new one.

## D7 — Freshness gate for `flowQuestions` is delegated to the extractor CLI `--check`; `content-i18n-lint` covers only parity for it

**Decision**: The drift gate for the new catalog is split across the two existing gate mechanisms by capability:

- **Freshness** (committed `content/i18n/en/flowQuestions.json` matches a fresh extraction from the TS question modules) → the extractor CLI's existing `--check` mode (`utilities/i18n-content-extract/cli.ts:--check`). Once `cli.ts` emits `flowQuestions.json`, `cli.ts --check` already covers its freshness. Wire that invocation into `pnpm lint` as its own step.
- **Locale key-set parity** (`fr/flowQuestions.json` has the same key set as the English source) → `content-i18n-lint` (`utilities/content-i18n-lint/index.js`), by adding `"flowQuestions.json"` to its `CATALOG_FILES`. Parity is pure JSON key-set comparison — no source read needed — so for `flowQuestions` its reference key set is the committed `en/flowQuestions.json` (freshness of which the CLI `--check` step separately guarantees), not a freshly-extracted map.

**Rationale**: `content-i18n-lint` is deliberately **plain Node** — its own header (`utilities/content-i18n-lint/index.js:1-35`) documents that it uses "`fs` + the `yaml` root devDependency only" and re-mirrors the extractor's field-walk in plain JS specifically to avoid needing a TS toolchain (neither the tsx-run extractor nor `@keyboard-studio/contracts`'s bundler-oriented `dist` is `require()`-able from plain Node). Flow questions have **no data-file source** — they are TS modules. There is no way for a plain-JS mirror to compute the fresh English key set for `flowQuestions` the way it does for the other three catalogs (which read YAML / `criteria.json`). Delegating freshness to the TS extractor's own `--check` keeps the field-walk **single-sourced** in `extract.ts` and honors `content-i18n-lint`'s no-TS-toolchain constraint.

**Alternatives considered**:
- Have `content-i18n-lint` `spawnSync` the tsx extractor `--check` internally, so `pnpm lint` keeps a single content-i18n gate. Rejected — it would make the plain-Node lint tool depend on a TS toolchain at runtime, the exact coupling its header was written to avoid.
- AST-scrape / regex the TS question modules in plain JS to mirror the field-walk. Rejected — fragile and duplicative; the extractor already does this correctly by importing the modules.
- Drop freshness for `flowQuestions` and rely on developers rerunning the extractor manually. Rejected — silent drift is exactly what spec 046 T031 built this gate to prevent (it caught a real stale `criteria` key at landing).
