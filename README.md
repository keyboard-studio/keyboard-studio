# keyboard-studio

Browser-based authoring studio for [Keyman](https://keyman.com) keyboards — a survey + show-by-example gallery that lets **language experts** create production-ready Keyman keyboards without writing `.kmn` by hand.

## What it is

Language experts know their language's phonology, orthography, and character inventory — but shipping a keyboard to [`keymanapp/keyboards`](https://github.com/keymanapp/keyboards) today means learning `.kmn` syntax, keeping a half-dozen package files consistent, and satisfying the PR-review criteria catalogued in [`docs/criteria.md`](docs/criteria.md). Keyboard Studio removes those mechanical barriers:

- **Start from a real keyboard** — every session adapts a single base: the US-English fallback, any `release/` keyboard from `keymanapp/keyboards`, or an uploaded `.kmn`. The base is parsed into a typed intermediate representation (`KeyboardIR`) that every later step edits; nothing operates on raw `.kmn` text.
- **Plain-language survey** — the user answers questions about their characters and how they behave, carves away base rules they don't want, and never sees `.kmn` syntax.
- **Strategy selection** — the survey computes seven discovery axes and runs a decision tree to choose the right output method (simple swap, deadkey composition, mnemonic spelling, diacritic cycling, context-sensitive clusters, IME callout, …) from a catalog of twelve strategies.
- **Show-by-example gallery** — the recommended strategy's interaction patterns appear as live mini-keyboards the user taps and confirms; each is a validated KMN skeleton with named slots.
- **Defaults first** — every step proposes a sensible default and asks for confirmation rather than starting blank; a missing default is treated as a defect.
- **In-browser compile + validate** — `kmcmplib` (WebAssembly) recompiles every edit within a single 300 ms cycle alongside a three-layer, language-aware lint engine, so invalid output is blocked before it reaches the compiler.
- **Touch layout for free** — a `.keyman-touch-layout` is scaffolded from the desktop rules; the physical layout stays the mandatory substrate.
- **Delivery** — a finished keyboard is downloaded as an installable `.kmp`, as a source `.zip`, or submitted directly via a GitHub OAuth fork-and-draft-PR to `keymanapp/keyboards`.

All authoring happens in an in-memory virtual filesystem that mirrors the `keymanapp/keyboards` layout. The studio is a static single-page app and never writes to the host disk.

## Status

**Day-1 contract locked; engine and studio built and under active development.** The spec is signed off (currently v2.0.0; see the changelog at the top of [`spec.md`](spec.md)). `packages/contracts` holds the locked shared contract — types, the seven service interfaces and their mocks, zod runtime schemas, and the triaged criteria catalog (149 rows at last count; the number is descriptive and expected to grow). The engine, the Layer-C lint engine, the LLM client, the Glottolog catalog, and the React + Vite SPA are all real packages. Per-package detail lives in [`docs/packages.md`](docs/packages.md); how they compose in [`docs/architecture.md`](docs/architecture.md).

## Quick start

Requires **pnpm 9** and **Node ≥ 22.19.0** (an older Node makes some codegen steps exit 0 having done nothing).

```sh
pnpm install
pnpm build       # runs `prebuild` first: fetches pinned upstream data and codegens artifacts
pnpm dev         # studio SPA at the Vite dev URL
pnpm test
```

Run `pnpm build` before `pnpm typecheck` or `pnpm test` on a clean checkout — the engine and studio resolve types from `contracts/dist/`, which only exists after a build. Corpus-calibrated tests expect a sibling `../keyboards` checkout tracking the [keyboard-studio/keyboards](https://github.com/keyboard-studio/keyboards) fork's `master`. Everything else — lint, the E2E suite, running a single package's tests, the standalone utilities — is in [`docs/tooling.md`](docs/tooling.md).

## Repository layout

| Path | What it is |
|------|------------|
| [`spec.md`](spec.md) | **The source of truth.** The signed-off spec (19 sections): system overview, the `Pattern` schema and `KeyboardIR`, three-group routing, the validator/lint architecture, output artifacts, team boundaries, and resolved decisions. |
| [`specs/`](specs/) | Per-feature specs (spec-kit). Numbered folders mirror the `spec.md` section they extract (e.g. `007-strategy-selection`) or take the next free number for new features. An extracted folder is authoritative for its section; `spec.md` keeps a stub pointer. |
| [`docs/spec-signoff.md`](docs/spec-signoff.md) | The review-cycle log and the baked-in decisions (D1–D9) — read this to see *why* a spec section reads the way it does. |
| [`docs/`](docs/) | Everything else you'd look up: [`architecture.md`](docs/architecture.md), [`packages.md`](docs/packages.md), [`tooling.md`](docs/tooling.md), [`workflow-model.md`](docs/workflow-model.md), [`keyboard-index.md`](docs/keyboard-index.md) (the phonebook of every keyboard the project references), [`criteria.md`](docs/criteria.md), [`lint.md`](docs/lint.md), [`accessibility.md`](docs/accessibility.md). |
| [`packages/contracts/`](packages/contracts/) | `@keyboard-studio/contracts` — the locked shared TypeScript contract and the dependency root: types, service interfaces, mocks, fixtures, zod schemas, criteria catalog. |
| [`packages/engine/`](packages/engine/) | `@keyboard-studio/engine` — codec (`.kmn` ↔ `KeyboardIR`), scaffolder, validator (Layer A/A'/B), compiler (`kmcmplib` wrapper), simulator, recognizer, strategy selector, pattern library, layout charts, and output (VirtualFS → `.kmp` / `.zip`). |
| [`packages/keyboard-lint/`](packages/keyboard-lint/) | `@keymanapp/keyboard-lint` — the Layer C hygiene lint engine, including the documentation checks. |
| [`packages/llm/`](packages/llm/) | `@keyboard-studio/llm` — pluggable LLM client for prompt-driven assistance. |
| [`packages/glottolog/`](packages/glottolog/) | `@keyboard-studio/glottolog` — offline, pinned Glottolog classification catalog plus the bridge that ranks candidate base keyboards from close genealogical relatives when a language has none. |
| [`packages/studio/`](packages/studio/) | `@keyboard-studio/studio` — the React + Vite authoring SPA (three-pane gallery / editor / preview over a single working copy). |
| [`api/`](api/) | Vercel serverless functions (OAuth exchange, managed PR submission, draft sync, crash reports). Outside the pnpm workspace; bundled separately and kept bundle-safe by [`api/bundle-safety.test.ts`](api/bundle-safety.test.ts). |
| [`content/`](content/) | Content-team assets: pattern library YAML, facet records, survey flows and journeys, adaptation questions, recognizer rules, i18n source catalogs. |
| [`utilities/`](utilities/) | Standalone tools deliberately kept out of `packages/*`: `spec-trace` (corpus search and drift tracking), the lint checkers chained by `pnpm lint`, `facet-index`, `kbgen`, the OAuth backend, the Python template-cleanup pipeline. |
| [`.claude/`](.claude/) | Claude Code agents, slash commands, and skills for the **KM crew** — the specialist pipeline coordinated by `/km-lead`. Roster: [`.claude/agents/km-README.md`](.claude/agents/km-README.md). |
| [`strategy tree/`](strategy%20tree/) | The original standalone `.kmn` strategy reference — **merged into spec §7** and retained only as a stub. |
| [`CLAUDE.md`](CLAUDE.md) | Orientation for working in this repo with Claude Code: the gates, cross-cutting invariants, and where everything else lives. |

## Scope (v1)

In scope: physical + touch keyboard layouts, package generation (`.kps` / `.kvks` / `.keyman-touch-layout` / `.keyboard_info`), the QWERTY/QWERTZ, AZERTY, and Non-Roman script groups, and single-source adaptation of an existing keyboard. Out of scope for v1: CJK, Ethiopic, and Hangul jamo-composition patterns (the gallery renders a "not yet supported" stub rather than going empty), LDML output, predictive-text wordlists, touch-first authoring, multi-source merge, survey-editing of opaque `.kmn` fragments, and byte-identical round-trip. Full list in [`spec.md` §16](spec.md#16-out-of-scope).

## Contributing

Commit and issue titles follow the [keymanapp/keyman](https://github.com/keymanapp/keyman) style — `<prefix>(<area>): <description>`, with `bug` for issues and `fix` for the PRs that close them (details in [`CLAUDE.md`](CLAUDE.md#commit-and-issue-title-style)). `main` accepts pull requests only; CI (`build`) and the `km-triage/review` check must pass before merge. Run `pnpm lint` and `pnpm test` locally first.

## License

[MIT](LICENSE).
