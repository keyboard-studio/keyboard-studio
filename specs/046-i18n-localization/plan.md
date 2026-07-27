# Implementation Plan: Studio UI & Content Localization (i18n)

**Branch**: `046-i18n-localization` (work landed on `km/i18n-lingui-spike`) | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/046-i18n-localization/spec.md`

## Summary

Externalize the studio's user-facing text into per-locale message catalogs, add
a Crowdin translation round-trip, and let an author run the Studio in their own
language. The design is **Lingui v6 with explicit, stable message ids**: the id
is durable identity (a translation stays bound across English edits) while the
English is stored as the catalog **value** so drift stays detectable (Crowdin
approval-reset + a CI drift gate). Delivered in three independently shippable
slices — P1 Studio UI (MVP, largely realized in the spike), P2 content strings
(via sidecar extraction), P3 translator-experience / operational hardening.

The approach is **additive**: no `Pattern`/`Criterion` schema change, no
KeyboardIR/codec/working-copy/validator change. It touches only string surfaces
and build/lint wiring, so it clears the constitution gates without escalation.

## Technical Context

**Language/Version**: TypeScript 6, React 18.3, Node ≥ 20 (CI on Node 22)

**Primary Dependencies**: Lingui v6 (`@lingui/core`, `@lingui/react`, `@lingui/cli`, `@lingui/vite-plugin`, `@lingui/babel-plugin-lingui-macro`, `@lingui/format-json`); Vite 7; vitest 4; Crowdin CLI (`@crowdin/cli`) for the TMS round-trip (CI/dev only, not bundled)

**Storage**: flat `{ id: text }` JSON catalogs committed under `packages/studio/src/locales/{locale}/messages.json` (source `en` carries English as value; targets carry translations). Compiled catalogs are build artifacts (gitignored). The persisted UI-locale choice lives in `localStorage` under `ks.locale`.

**Testing**: vitest unit/component tests; the `utilities/i18n-catalog-lint` drift gate wired into `pnpm lint` (hence CI). Playwright E2E for a locale-switch walk is a P3 option.

**Target Platform**: browser SPA (static Vite bundle); authoring in the in-memory VirtualFS.

**Project Type**: web application (the studio SPA) inside a pnpm monorepo.

**Performance Goals**: zero runtime TMS calls; English bundled synchronously so first paint never blocks on a fetch; non-source locales code-split and lazily activated.

**Constraints**: build-time localization only (no runtime Crowdin client in the shipped bundle); §12 team boundaries preserved (Tier A engine / Tier B content, separate Crowdin mappings); `criteria.json` localized copies must satisfy `CriterionSchema` and the 148-row count test must keep reading the canonical English file; no locked-schema edits.

**Scale/Scope**: P1 = studio UI chrome (~dozens of components); P2 = content strings (survey/adaptation prose, pattern `title`/`description`/`prompt`, criteria `description`); P3 = translator UX + ops. Locale count starts at `en` + one demo target (`fr`), grows by catalog files only.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 (unchanged — additive feature).*

| Article | Verdict | Notes |
|---------|---------|-------|
| I. Pattern schema locked | **PASS** | No edit to `pattern.ts`/`criteria.ts`/`schemas.ts`. Localization adds translated *values* only. Localized `criteria.<lang>.json` must satisfy `CriterionSchema`; the count test reads the canonical English file (FR-010). |
| II. KeyboardIR spine | **PASS (N/A)** | Feature does not touch codec/IR/scaffold. |
| III. Single working copy | **PASS (N/A)** | No working-copy or serialization change. |
| IV. Validator layering / one debounce | **PASS** | The drift gate is a lint/CI-time checker, not a runtime validation path; introduces no second debounce timer and no parallel validation. |
| V. VirtualFS only during authoring | **PASS** | Catalogs are build-time bundled JSON; no host-disk writes during authoring. The drift checker runs at lint/CI time (it extracts to a temp dir, never the working tree). |
| VI. Team boundaries (§12/§13) | **PASS — load-bearing** | Tier A (studio UI catalogs) = **engine team**, under `packages/studio`. Tier B (content strings) = **content team**, under `content/` + `packages/contracts`. Kept as **separate Crowdin file mappings**; catalogs are never merged cross-package (depcruise stays green — JSON catalogs aren't imports across the boundary). P2's extraction tooling is an engine↔content seam and needs joint coordination (flagged for a joint session before P2). |
| VII. Out of scope (§16) | **PASS** | Explicitly excludes the emitted keyboard's `welcome.htm` (Article VII names multi-language `welcome.htm`), LLM prompts (not user-facing), and RTL layout mirroring. *Note:* localizing the **studio UI** is distinct from the keyboard's `welcome.htm` — no conflict. |
| VIII. House conventions | **PASS** | Drift checker uses `[OK]`/`[ERROR]` (no emoji); markdown links; `prefix(area)` commits; no issue numbers in shipped code. |

**No violations** → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/046-i18n-localization/
├── spec.md              # feature spec (done)
├── plan.md              # this file
├── research.md          # Phase 0 — decisions + rationale
├── data-model.md        # Phase 1 — catalog/locale entities
├── quickstart.md        # Phase 1 — runnable validation
└── contracts/
    ├── catalog-format.md # message-catalog + id-namespace contract
    └── crowdin-mapping.md # crowdin.yml file-group + drift-gate contract
```

### Source Code (repository root)

```text
packages/studio/
├── lingui.config.ts                     # minimal-JSON formatter; LINGUI_CATALOG_CHECK_DIR override [done]
├── vite.config.ts / vitest.config.ts    # Lingui babel macro + vite plugin [done]
├── src/
│   ├── lib/i18n.ts                       # bootstrap: load en, resolve/persist/detect locale [done]
│   ├── lingui.d.ts                       # ambient *.json?lingui module [done]
│   ├── components/LocaleSwitcher.tsx      # NavBar locale picker [done]
│   ├── locales/{en,fr}/messages.json      # source (en) + target catalogs [done: welcome, nav, output.*]
│   └── <components…>                       # remaining chrome: survey, editors, dashboard, ui/ [P1 remaining]
├── package.json                           # messages:extract / messages:compile [done]

utilities/i18n-catalog-lint/index.js       # drift gate, wired into `pnpm lint` [done]
crowdin.yml                                 # root; Tier A active, Tier B deferred scaffold [done]

# Tier B (P2, content team) — NOT yet created:
content/i18n/{locale}/*.json               # generated sidecar catalogs
utilities/i18n-content-extract/            # extract translatable prose from content records
packages/contracts/data/criteria.<lang>.json  # localized criteria descriptions
```

**Structure Decision**: Web-application layout within the monorepo. Tier A lives
entirely under `packages/studio` (engine team). Tier B adds a `content/i18n/`
tree and an extraction utility under `utilities/` (content team + engine seam),
plus localized `criteria.<lang>.json` in `packages/contracts`. The two tiers are
separate Crowdin mappings to preserve the §12 boundary.

## Implementation status (what the spike already landed)

P1 foundation is committed on `km/i18n-lingui-spike` (PR #1248): Lingui wiring,
`i18n.ts` bootstrap + persistence + detection, `LocaleSwitcher`, the drift gate,
`crowdin.yml` Tier A, and the first chrome area (Output delivery screen). The
remaining P1 work is the mechanical chrome sweep (survey, editors, dashboard,
`ui/` aria-labels) plus provisioning the Crowdin project. P2/P3 are unstarted.

## Complexity Tracking

*No constitution violations — table intentionally empty.*
