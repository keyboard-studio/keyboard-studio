# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Day-1 contract lock landed.** As of 2026-06-03 the repo holds the v1.0 spec (with §7 strategy framework merged in) plus the locked Day-1 contract under `packages/contracts/src/` (~2,500 LOC of types + services + mocks + fixtures), the 133-entry triaged criteria catalog at `packages/contracts/data/criteria.json`, and Python template-cleanup tooling at `utilities/Template Cleanup/`. `packages/contracts` typechecks and tests clean (101 vitest specs). The remaining packages — `engine`, real `scaffolder`/`validator`/`compiler` implementations, the SPA shell — are still scaffolded but unbuilt; check before referencing them.

Update this file as new package skeletons land. Keep build/test/lint commands and the architecture map below in sync with reality.

## Source of truth

- **`spec.md`** — the v1.0 spec (signed off; 19 sections). Treat as authoritative for scope, schema, validator layering, team boundaries, and resolved decisions.
- **`docs/spec-signoff.md`** — review-cycle log and decision summary (D1–D6). Use this to see *why* a spec section reads the way it does before proposing changes.
- **`README.md`** — one-line external description; do not expand without reason.
- **`strategy tree/strategies.md`** — **superseded.** Merged into `spec.md §7`; now a stub pointer only. Do not edit it or treat it as a source.

**Relationship between `spec.md` and `strategies.md` (resolved — merged).** The two documents have been unified: the `.kmn` strategy framework (seven discovery axes A1–A7, the decision tree, the S-01…S-12 strategy catalog, building blocks, and the validation table) now lives in **`spec.md` Section 7 (Strategy selection)**. It is wired into the rest of the spec: the survey computes the axes (§7.1), the strategy selector runs the decision tree (§7.2) to pick a strategy, and each `Pattern` (§5) links to its strategy card via the (ratified) optional `strategyId` / `combinesWith` fields. The §7.5 validation table is a self-consistency regression suite — two intentional v1.1 gaps (EuroLatin, IPA) are documented; keep §7.1/§7.2/§7.3 and that table mutually consistent across any edit.

The spec embeds external docs by reference (Sec 19): `docs/KM-Questionnaire.md`, `docs/lint.md`, `docs/criteria.md`, `docs/making-a-template.md`. These live in the planned repo layout but are not yet in this working copy — fetch from `https://github.com/MattGyverLee/keyboard-studio` if needed.

## Planned architecture (from spec)

These are *targets*, not present state. Use them when scaffolding new work; do not invent deviations.

- **Monorepo layout.** `packages/contracts` holds the shared TS types (Pattern, LintFinding, SurveyAnswer, VirtualFS — spec Sec 5, Sec 12). Both engine and content teams build to these interfaces.
- **Two teams, parallel after Day 1.** Engine owns the SPA, scaffolder, compiler service (WASM `kmcmplib`), validator packages, output paths. Content owns the pattern library, survey text, gallery ordering, LLM prompts, and `criteria.md` triage. Spec Sec 12 has the exact split — respect it when picking up work.
- **Validator layering.** Three layers in two packages — `@keymanapp/kmn-validator` (Layer A validity + Layer B style) and `@keymanapp/keyboard-lint` (Layer C hygiene). Layer A is 9 TS-portable checks + 5 WASM-only; spec Sec 10 has the check-by-check source-file references into `kmcmplib`.
- **Single 300 ms debounce cycle.** TS-check and WASM oracle run as concurrent microtasks in the same cycle (decision D3). Do not introduce a second debounce timer.
- **Virtual FS.** All authoring happens in an in-memory FS mirroring `keymanapp/keyboards` layout (spec Sec 11); serialized at output time to a `.zip` or committed via GitHub OAuth fork+PR. The studio does not write to disk during authoring.

## Pattern schema is a contract

The `Pattern` TS interface in spec Sec 5 is the Day-1 contract (issue #5). Treat its field names, types, and `{{slotId}}` placeholder syntax as locked. Per the revision policy (Sec 17):

- Prose section edits — single-reviewer approval.
- `Pattern` schema field renames/type changes/removals — major version bump of `packages/contracts` + joint engine+content session.
- Reopening a resolved decision (D1–D6, Sec 14) — explicit revision request citing original decision and new evidence; **not** informal.

If a task seems to require schema-breaking changes, surface this to the user before editing — don't change the schema silently.

## Out of scope for v1 (do not implement)

Spec Sec 16. CJK and Ethiopic reorder patterns, LDML output, mobile-app integration, hosting, multi-language `welcome.htm` variants, editing existing keyboards, `.kpj.user` management, touch-first authoring (Decision 6). The Three-group routing (Sec 9) explicitly renders a "not yet supported" stub for CJK/Ethiopic — do not silently empty the gallery.

## KM crew

`Agents/km-*.md` are slash-command dispatchers that invoke the corresponding subagent. The dispatch protocol — including `km-lead`'s `dispatch_plan` block format and the requirement that the main session execute the plan and re-invoke `km-lead` until no plan is returned — lives in the user's global CLAUDE.md, not here. Don't duplicate it.

Use the KM crew for review cycles on spec or code changes; `docs/spec-signoff.md` is the model for what a completed cycle looks like.

## Conventions

- Windows environment: no emoji in console output (global CLAUDE.md rule). Use `[OK]`, `[ERROR]`, `[WARN]` etc.
- File references in user-facing text use markdown links (`[spec.md](spec.md)`), not backticks, per the VSCode-extension guidance in the system prompt.
- Don't cite specific GitHub issue numbers inside shipped code or comments — cross-link via commit messages and PR bodies (spec Sec 18).

## Commit and issue title style

Adopted from [keymanapp/keyman](https://github.com/keymanapp/keyman/issues). Format: `<prefix>(<area>): <description>`.

**Prefixes**

- `bug` — issue titles only; a reported defect
- `fix` — PRs / commits that close a `bug`
- `feat` — new functionality (issues, PRs, commits)
- `docs` — documentation only
- `chore` — housekeeping with no behaviour change (deps bumps, formatting, build wiring)
- `maint` — internal cleanup that touches functional code but is not a feature or fix (renames, dead-code removal, shape-preserving cleanup)
- `refactor` — structural restructuring with no behaviour change
- `epic` — umbrella tracking issue (no area)
- `auto` — machine-generated (dep bumps, version bumps)

**Areas** (parenthesised after the prefix; pick the smallest that locates the change):
`contracts`, `tools`, `scaffolder`, `engine`, `studio`, `output`, `criteria`, `spec`, `process`, `base-browser`, `deps`, `deps-dev`. Drop the area if the change spans more than one (e.g. `chore: bump TS across packages`).

**Examples**

- `bug(scaffolder): scaffold() doesn't validate keyboardId per §10 Layer A check #1`
- `fix(scaffolder): validate keyboardId in scaffold() before VirtualFS write` (PR closing the bug)
- `feat(tools): K_SYMBOLS placement algorithm + dry-run preview`
- `docs(spec): clarify §7.2 decision-tree firing order`
- `chore(deps): bump vitest 1.6 → 2.0`
- `maint(contracts): rename PatternQuestion.required → optional`

Keep `bug` and `fix` separate — `bug(...)` issues link to `fix(...)` PRs via `closes #N`. Mixing the two blurs the issue/PR relationship.
