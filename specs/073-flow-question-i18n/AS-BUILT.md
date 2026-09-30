# Spec 073 Flow-Question Content i18n: as built

**Status:** Retired 2026-09-29. Shipped in PR #1387 (squash `6d9f0d82`, 2026-07-27; folder was numbered 050 until the #1644 renumber, so older code and commits say "spec 050"). Tasks: 19/19 complete.
**Full docs:** [specs/_archive/073-flow-question-i18n/](../_archive/073-flow-question-i18n/) (spec, plan, tasks, research, data-model, quickstart, checklists). Not read by default.
**Pinned here:** [contracts/flow-question-catalog-format.md](contracts/flow-question-catalog-format.md) (linked by docs/i18n-spike.md as the catalog-format reference; it also links spec 055's audit_label contract).

## What shipped
- A fourth Tier B content catalog, `flowQuestions`, alongside `patterns`, `adaptationQuestions`, `criteria`: `content/i18n/en/flowQuestions.json` (generated) and `content/i18n/fr/flowQuestions.json` (first locale).
- The extractor walks the live phase registries and emits the catalog: `extractFlowQuestionStrings()` in `utilities/i18n-content-extract/extract.ts`.
- `QuestionField.tsx` resolves prompt, label, body, help text and option labels through the catalog, with English fallback.
- Two lint gates: freshness through the extractor CLI `--check`, key-set parity through `content-i18n-lint`.
- docs/i18n-spike.md and spec 046 were updated from "three Tier B catalogs" to four.

## Public contracts
- Catalog: flat JSON `{ "<key>": "<text>" }` at `content/i18n/{locale}/flowQuestions.json`. `en` is generated, never hand-edited. Format authority: the pinned contract.
- Key namespace: `content.flowQuestion.<questionId>.<field>`; `<field>` is `prompt`, `label`, `body`, `help_text`, `option.<slug>.label`, or the optional `audit_label` (added by spec 055). The registry key kind is `flowQuestions: "flowQuestion"` in `packages/studio/src/lib/contentI18n.ts`, with `ContentCatalogType` widened to include `"flowQuestions"`.
- Never extracted: `id`, `type`, `required`, `options_source`, `next`, `engine_resolved`, `advisory`, `options[].value`, `options[].note`. Only live phase A, B, F and G registries are scanned; the demoted `registry.reserve.ts` is excluded.
- Render seam: `resolveFlowText` in `packages/studio/src/survey/QuestionField.tsx` calls `resolveContentString("flowQuestions", id, field, englishValue, i18n)` and then `interpolate(...)`. Resolution precedes interpolation, so translated values keep their own `{{token}}` placeholders.
- Gates: `pnpm run content-i18n-freshness` (extractor `cli.ts --check --quiet`) and `pnpm run content-i18n-lint` (`utilities/content-i18n-lint/index.js`, `flowQuestions.json` is in its parity-only list, with `audit_label` keys exempt from strict parity), both in `pnpm lint`.

## Key decisions
- Extraction is a real TS import of the registries, not YAML or AST parsing; flow questions have no data-file source (research D1, D2, D3).
- Reuse `resolveContentString`; no new hook (D6).
- Freshness delegated to the extractor `--check`; the plain-Node lint checks parity only, so it keeps no TS-toolchain dependency (D7).
- Option-label keys use `slugifyIdSegment(opt.value)` because some option values contain literal dots (for example "0.6").
- User-entered answers (autonym, BCP47 tag, free text) are never routed through the catalog (SC-004).

## Gotchas and limits
- Adding or rewording any live question prompt makes the committed `en` catalog stale: re-run the extractor, or `pnpm lint` fails.
- Message ids for Tier A UI strings are a separate system (`.po` catalogs); this catalog is Tier B content only.
- `fr` was hand-authored ahead of the Crowdin round-trip; Crowdin owns it once that mapping is live.

## Divergences from the spec
- Contract text writes option keys as `option.<optionValue>.label`; code writes `option.<slugified value>.label` (`QuestionField.tsx:693`, `:724`). Identical for dot-free values.
- Contract cites `QuestionField.tsx:730`, `:764`, `:789` as render sites; those line numbers have since moved.

## Follow-ups and open issues
- Locales beyond `fr` need translation only, no code change (SC-002).
- Docs linking into the folder (docs/i18n-spike.md:125 links `spec.md`) will land on the archive stub; the pinned contract link at :144 keeps resolving. Source comments at `contentI18n.ts:24` and `contentI18n.test.ts:103` cite `research.md` D5, which is now archived.
