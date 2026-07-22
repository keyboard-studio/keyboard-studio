# i18n spike — Lingui with explicit IDs (studio SPA)

**Status:** spike / proof-of-concept on branch `km/i18n-lingui-spike`. Not wired to
Crowdin yet; one view ([WelcomeScreen.tsx](../packages/studio/src/components/WelcomeScreen.tsx))
is converted as the proof. Nothing here is a locked contract.

## Why Lingui, and why explicit IDs

We want **stable message IDs** so a translation stays bound to the same logical
string even when the English is tweaked — but without losing the signal that the
English *did* change (the trade-off raised in review). Lingui's macros give us
both:

```tsx
import { Trans } from "@lingui/react/macro";

<Trans id="welcome.title">Welcome to Keyboard Studio</Trans>
```

- `id` is the **stable identity** — never drifts when the copy is edited.
- The child text is the **English source** — it lands in the catalog as the
  *value*, so English drift is detectable (see below).

The macro compiles to a runtime `<Trans id="welcome.title" message="Welcome to Keyboard Studio" />`,
so the English is preserved as the fallback and the extractor can see it.

## The drift signal is recovered on the *value*

`pnpm --filter @keyboard-studio/studio messages:extract` produces flat JSON:

```jsonc
// src/locales/en/messages.json      (source locale — English is the value)
{ "welcome.title": "Welcome to Keyboard Studio", ... }

// src/locales/fr/messages.json      (target — same keys, empty until translated)
{ "welcome.title": "", ... }
```

Because the English is the **value** under a stable **key**, Crowdin (which
fingerprints the value for a key-value JSON file) sees an edit whenever the
English changes under an unchanged id, and **resets that string's approvals to
"needs review" while keeping the existing translation linked**. So:

- stable ids → translations stay bound across English tweaks ✔
- English-as-value → English drift still raises a review flag ✔

`git diff` on `en/messages.json` is a second, repo-local drift detector (a PR that
changes an English value but no target file is, by definition, introducing stale
translations — easy to gate in review).

> **Format choice, confirmed by the spike:** `@lingui/format-json` **`style: "minimal"`**
> (flat `{ id: text }`) is the right catalog format here. The default `.po` /
> `style: "lingui"` formats put the source in `msgid` / a nested field, which
> muddies Crowdin's value-fingerprinting when ids are explicit. Minimal JSON keeps
> the id as the Crowdin string key and the English as the fingerprinted value.

## What the spike wired up

| File | Change |
|------|--------|
| [lingui.config.ts](../packages/studio/lingui.config.ts) | `sourceLocale: en`, `locales: [en, fr]`, minimal-JSON formatter |
| [vite.config.ts](../packages/studio/vite.config.ts) | `@lingui/babel-plugin-lingui-macro` on `react()` + `lingui()` plugin |
| [vitest.config.ts](../packages/studio/vitest.config.ts) | same Lingui wiring so the macro transforms and `?lingui` resolves in tests |
| [src/lib/i18n.ts](../packages/studio/src/lib/i18n.ts) | bootstrap: sync-load `en`, `activateLocale()` for lazy target locales |
| [src/lingui.d.ts](../packages/studio/src/lingui.d.ts) | ambient module for `*.json?lingui` imports |
| [StudioShell.tsx](../packages/studio/src/StudioShell.tsx) | owns the `I18nProvider` (covers the app **and** the ~40 direct-render tests) |
| [WelcomeScreen.tsx](../packages/studio/src/components/WelcomeScreen.tsx) | 5 strings converted to `<Trans id=...>` (the proof) |
| `package.json` | `messages:extract`, `messages:compile` scripts |

Compiled catalogs (`messages.js`) are gitignored — the `?lingui` Vite plugin
compiles the JSON at import time, so only the JSON sources are committed.

## Verification

- `pnpm --filter @keyboard-studio/studio typecheck` — clean.
- `pnpm --filter @keyboard-studio/studio test src/StudioShell.test.tsx` — 35/35
  pass, including the WelcomeScreen render tests, proving macro transform +
  provider + `?lingui` all work end-to-end.
  - **Local Node ≥22 caveat:** run with `NODE_OPTIONS="--localstorage-file=.ls-tmp.db"`
    or the studio storage tests fail at `localStorage.clear()` in `beforeEach`
    (native `localStorage` shadows jsdom's — environmental, CI on Node 22 is fine).

## Crowdin wiring (step 1 — drafted)

[crowdin.yml](../crowdin.yml) at the repo root:

- **Tier A (Studio UI) — active.** Maps `packages/studio/src/locales/en/messages.json`
  → `…/%two_letters_code%/messages.json`. Credentials come from env vars
  (`CROWDIN_PROJECT_ID`, `CROWDIN_PERSONAL_TOKEN`) — never committed.
- **Tier B (content strings) — deferred, commented scaffolding only.** Crowdin's
  generic JSON/YAML parser translates every string value, so pointing it at the
  raw content records would hand control fields (`id`, `answerType`, `default`,
  `firingCondition`, BCP47 tags, `criteria.json` ids …) to translators. The
  intended design is a build step that extracts translatable prose into flat
  `{id: text}` sidecar catalogs (Tier A shape); `criteria.json` is further gated
  by its zod schema + the 148-count test. Both are feature-spec decisions.

**Verify once credentials are set:** `crowdin upload sources --dry-run -b main`
(the CLI has no offline config validation — every command authenticates).

## Drift gate (step 3 — implemented)

[utilities/i18n-catalog-lint/index.js](../utilities/i18n-catalog-lint/index.js) —
a read-only plain-node checker (same shape as `facet-index-lint`), wired into
`pnpm lint` (so CI's existing lint step runs it — no `ci.yml` change) and exposed
as `pnpm run i18n-catalog-lint`. It:

- extracts a **fresh** catalog into a temp dir (via the config's
  `LINGUI_CATALOG_CHECK_DIR` override) so it never touches the committed
  catalogs — safe locally and in `pnpm lint`;
- fails if the **source** (`en`) catalog differs in keys **or values** (catches
  added/removed strings *and edited English under an unchanged id* — the drift
  signal the stable-id scheme would otherwise hide);
- fails if a **target** locale's key set drifts (a new string not propagated);
- fix on failure: `pnpm --filter @keyboard-studio/studio messages:extract`, commit.

Verified: green when in sync; on an English edit under a stable id it reports
`[en] source catalog out of date — English changed: welcome.title` and exits 1.

## Translator context for ambiguous ids (spec 046 T036)

Lingui's `t`/`Trans`/`Plural` macros accept a `comment` field, but it does **not**
survive into the shipped catalog: the `minimal` JSON style is a deliberately bare
`{id: text}` map (see "Why Lingui, and why explicit IDs" above) with no room for
metadata, and it is the exact file Crowdin reads (`crowdin.yml`) — so a macro
`comment` would be extracted, then silently dropped at the catalog-format
boundary. Confirmed empirically: adding `comment: "…"` to a message descriptor,
re-running `messages:extract`, and diffing the catalog shows no trace of it.
Switching catalog styles to preserve comments is a locked-contract change (the
flat shape is what recovers the drift signal — [contracts/catalog-format.md](../specs/046-i18n-localization/contracts/catalog-format.md)),
so it's out of scope here.

Crowdin does let a project manager attach context (text or a screenshot) to a
string directly in its web UI, independent of the source file. The table below
is the reference for pasting that context in — curated for ids whose bare
English value is short, jargon-y, or otherwise likely to mislead a translator
working from the string alone (not exhaustive; extend it as new ambiguous ids
are spotted):

| id | value | context |
|---|---|---|
| `editor.assignLoop.companion.confirmButton` | "Map it" | Confirms assigning the current character to the key/mechanism being configured — not a literal map/cartography sense. |
| `editor.assignLoop.glyphCell.goTo` | "go to" | Fragment of a cross-reference link ("go to" + a location name rendered separately) — a navigation verb, not a noun phrase. |
| `editor.assignLoop.infoView.keyEyebrow` | "Key" | Physical/virtual keyboard key (noun) — not "key" as in cryptographic key or a legend/answer key. |
| `editor.assignLoop.infoView.typesEyebrow` | "types" | Category label heading a list of rule *types* — not related to typing/keystrokes. |
| `editor.assignLoop.inspector.roleChip.input` / `.output` / `.inOut` | "input" / "output" / "in+out" | Badge on a `.kmn` rule showing which side of the rule (left context vs. produced output) a character participates in — not generic I/O. |
| `editor.assignLoop.inspector.ruleTypeBadge.direct` | "DIRECT" | Keyman rule-type jargon (a rule producing its output directly, vs. via a deadkey/store) — keep terse, don't expand into a sentence. |
| `editor.assignLoop.swap.layerBase` / `.layerShift` | "Base" / "Shift" | Keyboard *layer* names (the unshifted layer vs. the Shift-held layer) — "Shift" here is the layer, not an instruction to press Shift. |
| `editor.trackStep.adaptTitle` / `.copyTitle` | "Adapt" / "Copy" | Names of the two Day-1 authoring tracks (spec §4: adapt an existing keyboard vs. copy-and-edit one) — noun-ish labels, not imperative verbs. |
| `survey.characterMapPane.tier.main` | "main" | One of the character-map's coverage tiers (its "main"/primary inventory tier) — not "main" as in a main menu or entry point. |
| `dashboard.flowGraph.badge.gate` / `.stub` / `.lock` / `.entry` / `.engine` | "gate" / "stub" / "lock" / "entry" / "engine" | Node-kind badges in the internal question-flow diagram (dashboard, dev-facing) — each names a `SurveyPhaseResult`/flow-graph node kind, not the everyday-English sense of the word. |
| `dashboard.strategyTree.rule.else` / `.secondaryChip.if` / `.secondaryPass.addArrow` | "else ↓" / "if {0}" / "→ add" | Pseudocode/diagram fragments in the strategy-decision-tree visualization (dev-facing) — render as-is inside a flowchart node, not as prose. |

## Locale switcher (implemented)

[LocaleSwitcher.tsx](../packages/studio/src/components/LocaleSwitcher.tsx) in the
NavBar (all routes): reads the active locale from the Lingui context (so it
re-renders on change), and on selection **persists** the choice
(`ks.locale` in localStorage, guarded like [firstVisit.ts](../packages/studio/src/lib/firstVisit.ts))
and **activates** it (lazy catalog load). Bootstrap resolution order:
saved choice → browser language (`navigator.language`) → English
(`resolveInitialLocale()` in [lib/i18n.ts](../packages/studio/src/lib/i18n.ts)).
Option labels are each language's own autonym (not translated); the field label
is localized. The `fr` catalog now carries **illustrative** translations so the
switch is demonstrable — Crowdin owns the real ones later.

## Not done (next steps if we adopt)
- Convert the rest of the UI chrome; agree the id namespace convention
  (`area.component.thing`).
- Team-boundary check: UI catalog lives under `packages/studio` (engine team);
  content strings stay in `content/` + `packages/contracts` (content team, spec §12).
