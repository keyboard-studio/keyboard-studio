# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Day-1 contract lock landed.** As of 2026-06-03 the repo holds the v1.0 spec (with §7 strategy framework merged in) plus the locked Day-1 contract under `packages/contracts/src/` (~2,500 LOC of types + services + mocks + fixtures), the 133-entry triaged criteria catalog at `packages/contracts/data/criteria.json`, and Python template-cleanup tooling at `utilities/Template Cleanup/`. `packages/contracts` typechecks and tests clean (101 vitest specs). The remaining packages — `engine`, real `scaffolder`/`validator`/`compiler` implementations, the SPA shell — are still scaffolded but unbuilt; check before referencing them.

**kbgen (placement seeder) — prototype, lives in `utilities/kbgen/`.** A standalone Node CLI that derives data-driven character placement (which key, which mechanism) from pinned Unicode/CLDR signals and emits a `placement-map.json`. Intended to become an engine deliverable (a seeder ahead of the survey, §8 Phase B), but it is CommonJS/plain-JS, does not conform to the `packages/contracts` types, and implements only S-01/S-08 of the §7.3 catalog. It is kept out of `packages/*` so it does not trip `pnpm -r`. Conformance path + open joint-session questions: [utilities/kbgen/INTEGRATION.md](utilities/kbgen/INTEGRATION.md). Do not treat it as a built package.

Update this file as new package skeletons land. Keep build/test/lint commands and the architecture map below in sync with reality.

## Source of truth

- **`spec.md`** — the v1.0 spec (signed off; 19 sections). Treat as authoritative for scope, schema, validator layering, team boundaries, and resolved decisions.
- **`docs/spec-signoff.md`** — review-cycle log and decision summary (D1–D6). Use this to see *why* a spec section reads the way it does before proposing changes.
- **`README.md`** — one-line external description; do not expand without reason.
- **`strategy tree/strategies.md`** — **superseded.** Merged into `spec.md §7`; now a stub pointer only. Do not edit it or treat it as a source.

**Relationship between `spec.md` and `strategies.md` (resolved — merged).** The two documents have been unified: the `.kmn` strategy framework (seven discovery axes A1–A7, the decision tree, the S-01…S-12 strategy catalog, building blocks, and the validation table) now lives in **`spec.md` Section 7 (Strategy selection)**. It is wired into the rest of the spec: the survey computes the axes (§7.1), the strategy selector runs the decision tree (§7.2) to pick a strategy, and each `Pattern` (§5) links to its strategy card via the (ratified) optional `strategyId` / `combinesWith` fields. The §7.5 validation table is a self-consistency regression suite — two intentional v1.1 gaps (EuroLatin, IPA) are documented; keep §7.1/§7.2/§7.3 and that table mutually consistent across any edit.

The spec embeds external docs by reference (Sec 19): `docs/KM-Questionnaire.md`, `docs/lint.md`, `docs/criteria.md`, `docs/making-a-template.md`. These live in the planned repo layout but are not yet in this working copy — fetch from `https://github.com/MattGyverLee/keyboard-studio` if needed.

**Keyboard phonebook.** When you need to locate or look up a keyboard this project references — by name, language, author, or where its source lives on disk — consult [docs/keyboard-index.md](docs/keyboard-index.md) **first**. It maps each acknowledged keyboard to its BCP47 languages, author, and relative path. The keyboards themselves live in the sibling `keymanapp/keyboards` checkout at `../keyboards`, not in this repo. **Keeping the phonebook current is mandatory, not optional:** it indexes only keyboards already referenced, so whenever you introduce, cite, or otherwise reference a keyboard that is not yet in the table, you MUST add its row in the same change (read the keyboard's `<id>.kps` for name, BCP47 languages, and author — see the "Keep this current" recipe in that file). Treat a stale phonebook as a defect.

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

The KM crew is a 16-specialist review/build pipeline coordinated by **`/km-lead`**. Files under `.claude/agents/km-*.md` define each specialist; `.claude/commands/km-*.md` and `skills/km-*.md` are the entry points.

### How /km-lead operates (different from /lex-lead)

`/km-lead` does **not** run as an isolated subagent. It loads a team-lead playbook into the **main session's** context — the main session adopts the lead role, plans the work, and spawns specialists itself via the Agent tool. Unlike `/lex-lead` (which is a subagent that emits a `dispatch_plan` YAML block for the main session to parse and execute), km-lead has no planner/executor separation: planner and executor are the same actor.

**dispatch_plan as transparency.** Even though there's no second actor to consume it, km-lead **must write a `dispatch_plan` block before every cycle's dispatch** so the user can see — and interrupt — exactly which specialists are about to be spawned, with which prompts. The block is followed in the **same response** by the actual parallel Agent calls that execute it. Required for every dispatch, including single-specialist cycles.

Format mirrors lex-lead's (`cycle:`, `rationale:`, `groups:` with `mode: parallel | sequential`, `tasks:` with `subagent_type`, `prompt`, `expected_artifact`), but the `on_return:` field is omitted — the same session synthesizes the returned reports.

### Branch policy

One feature branch per km-lead cycle. Convention: `km/<short-task-slug>` (e.g. `km/wasm-oracle-wrapper`, `km/issue-39-preview`).

- `/km-lead` opens the branch at cycle 1 (or confirms an existing branch if continuing prior work) and names it in the dispatch_plan rationale.
- All specialist commits during the cycle target that branch.
- `/km-archivist` opens a PR against `main` at cycle close with `closes #N` if there's an associated issue.
- **Direct-to-main is permitted only when the user explicitly authorizes it** for the specific commit (e.g. "just commit it direct to main"). Implicit authorization (running `/km-lead`) is not enough.

When in doubt, branch.

### Issue closure policy

When a cycle lands work that touches a tracked issue (`#N`), the closing specialist — usually `/km-archivist` at PR open, but also `/km-lead` for direct-to-main commits — must reconcile what shipped against the issue's acceptance-criteria checkboxes:

1. **Enumerate the AC checkboxes.** `gh issue view N --json body` and walk the `- [ ]` list. If the issue has no checkboxes, this policy does not apply.
2. **Verify each one against the diff.** A checkbox is *done* only if the shipped change actually satisfies it — not if "we meant to" or "it's covered by another PR." Run the relevant command, read the relevant file, or call the relevant specialist (typically `/km-verification`) to confirm.
3. **Check the boxes that are done.** `gh issue edit N --body "<updated>"` with the verified boxes flipped to `- [x]`. Leave a one-line note in the issue or PR body explaining which boxes flipped and which didn't.
4. **Pick the right closing keyword.**
   - **All boxes checked** → `closes #N` in the PR or commit message.
   - **Some boxes still open** → `refs #N` (not `closes`), and the issue stays open. Do not check boxes you haven't verified.

The point: an issue with half its checkboxes flipped is more honest than one closed prematurely or one left fully unchecked despite real progress. Partial closures are normal; silent partial closures are the bug.

### Use the crew for…

Review cycles on spec or code changes; coordinated multi-specialist refactors; anything that benefits from parallel specialist perspectives. `docs/spec-signoff.md` is the model for what a completed cycle looks like.

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
