# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Day-1 contract lock landed.** As of 2026-06-03 the repo holds the v1.0 spec (with §7 strategy framework merged in) plus the locked Day-1 contract under `packages/contracts/src/` (~2,500 LOC of types + services + mocks + fixtures), the 145-entry triaged criteria catalog at `packages/contracts/data/criteria.json` (133 repo-hygiene rows + 12 section-18 DISCUS design-heuristics rows; see [docs/discus-principles-integration.md](docs/discus-principles-integration.md)), and Python template-cleanup tooling at `utilities/Template Cleanup/`. `packages/contracts` typechecks and tests clean (131 vitest specs). The remaining packages — `engine`, real `scaffolder`/`validator`/`compiler` implementations, the SPA shell — are still scaffolded but unbuilt; check before referencing them.

**kbgen (placement seeder) — prototype, lives in `utilities/kbgen/`.** A standalone Node CLI that derives data-driven character placement (which key, which mechanism) from pinned Unicode/CLDR signals and emits a `placement-map.json`. Intended to become an engine deliverable (a seeder ahead of the survey, §8 Phase B), but it is CommonJS/plain-JS, does not conform to the `packages/contracts` types, and implements only S-01/S-08 of the §7.3 catalog. It is kept out of `packages/*` so it does not trip `pnpm -r`. Conformance path + open joint-session questions: [utilities/kbgen/INTEGRATION.md](utilities/kbgen/INTEGRATION.md). Do not treat it as a built package.

Update this file as new package skeletons land. Keep build/test/lint commands and the architecture map below in sync with reality.

**Delivery-option progress lives in [`docs/github_flow.md`](docs/github_flow.md) — Status section.** Whenever work lands that advances Option A (user-fork/app-managed PR), Option B (org-mediated PR), or Option C (ZIP download), update that table and the progress bar before closing the issue or merging the PR. The scaffolder and VirtualFS serialisation rows in the prerequisites table also need updating as those land.

## Source of truth

- **`spec.md`** — the v1.3.0 spec (v1.0 signed off; v1.1.0 KeyboardIR import amendment applied 2026-06-08; v1.1.1 placement-priors amendment applied 2026-06-11; v1.2.0 hybrid-workflow + scoped-gallery amendment applied 2026-06-13, see [docs/workflow-model.md](docs/workflow-model.md) — typed assignment-map contract held for the #5b joint session; v1.3.0 working-copy spine + two authoring tracks amendment applied 2026-06-14 — single persistent working copy instantiated at keyboard selection via Track 1 `instantiateFromBase` or Track 2 `instantiateFromExisting`, all steps mutate it, serialized only at output; extends Decision 9). Treat as authoritative for scope, schema, validator layering, team boundaries, and resolved decisions.
- **`docs/spec-signoff.md`** — review-cycle log and decision summary (D1–D9). Use this to see *why* a spec section reads the way it does before proposing changes.
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
- Reopening a resolved decision (D1–D9, Sec 14) — explicit revision request citing original decision and new evidence; **not** informal.

If a task seems to require schema-breaking changes, surface this to the user before editing — don't change the schema silently.

## Out of scope for v1 (do not implement)

Spec Sec 16. CJK and Ethiopic reorder patterns, LDML output, mobile-app integration, hosting, multi-language `welcome.htm` variants, `.kpj.user` management, touch-first authoring (Decision 6). The v1.1.0 amendment removed "editing existing keyboards" — single-source adaptation is now in scope. Still out of scope: multi-source merge, survey-editing opaque IR fragments (`RawKmnFragment`), and byte-identical round-trip. The Three-group routing (Sec 9) explicitly renders a "not yet supported" stub for CJK/Ethiopic — do not silently empty the gallery.

## KM crew

The KM crew is a specialist pipeline coordinated by **`/km-lead`**. Agent definitions live in `.claude/agents/km-*.md`; slash-command entry points live in `.claude/commands/km-*.md`.

### The one skill: `/km-lead`

`/km-lead` is the **only** KM crew member invoked as a Skill. It loads a team-lead playbook into the **main session's** context. The main session adopts the lead role, plans the work, and spawns all other specialists as Agent subagents. It is not itself a subagent.

Use `/km-lead` when starting any coordinated team task. For brief, one-off tasks where the main session needs to temporarily act as a single specialist (e.g. a quick archivist action), you may invoke the individual skill — but when running a team task through km-lead, **always use the other roles as Agent subagent_types, never as skills**.

### All other km-* roles: Agent subagent_types

Every specialist except km-lead is defined in `.claude/agents/` and should be invoked via `Agent({ subagent_type: "<name>", prompt: "..." })`. The individual `/km-*` slash commands exist for one-off use only.

**Implementation**
- `km-programmer` — implements code changes across the TS monorepo (contracts, scaffolder, engine, validator)
- `km-frontend` — SPA front-end (TypeScript + React + Vite); three-pane layout, 300 ms debounce, VirtualFS authoring
- `km-simplify` — refactor specialist; removes dead code, consolidates duplication

**Domain expertise**
- `km-domain` — master linguist; script/layout/normalization/IME-design decisions
- `km-keyman` — Keyman / `.kmn` / `kmcmplib` expert; Pattern schema semantics, 14 Layer-A checks
- `km-strategy` — owns spec §7 strategy framework (A1–A7, decision tree, S-01..S-12, §7.5)
- `km-validator` — validator-layer specialist; spec §10 three-layer architecture, Layer A/B/C checks
- `km-output` — output / scaffolder / VirtualFS specialist; spec §11/§12, zip, GitHub OAuth fork+PR
- `km-author` — original-intent reviewer; keymanapp/keyman upstream parity, `.kmn` idioms

**Quality gates**
- `km-qc` — code-quality review; style, complexity, error handling, test coverage
- `km-verification` — verifies a change does what it claims; runs tests, produces pre/post evidence
- `km-testing` — vitest + Playwright suite engineer; fixtures, round-trip test vectors
- `km-synthesis` — integration-fit reviewer; checks new code against existing patterns, flags duplication

**Coordination & documentation**
- `km-archivist` — git commits, PR creation, AC reconciliation, CHANGELOG, release cuts
- `km-doc` — maintains `docs/`, spec-signoff log, module docstrings
- `km-README` — read-only crew roster reference

### How /km-lead operates

`/km-lead` loads the team-lead playbook into the main session. km-lead plans work, writes a `dispatch_plan` YAML block before every cycle so the user can see what's about to fire, then immediately calls the Agent tool to execute it in the same response. Independent specialists in the same cycle run in parallel.

### Branch policy

One feature branch per km-lead cycle. Convention: `km/<short-task-slug>`.

- Open the branch at cycle 1. State it in the dispatch_plan `branch:` field.
- All specialist commits during the cycle target that branch.
- `km-archivist` opens a PR against `main` at cycle close with `closes #N` or `refs #N` per the issue closure policy below.
- **Direct-to-main only when the user explicitly authorizes it** for that specific commit.

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
