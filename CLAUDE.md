# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm 9** (Node ≥ 20). Run from the repo root unless noted.

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build everything | `pnpm build` (runs `prebuild` first — see below) |
| Typecheck | `pnpm typecheck` |
| Test everything | `pnpm test` (`pnpm -r test` → each package's vitest) |
| Lint / format | `pnpm lint` (ESLint over `packages/*/src`, then `pnpm depcruise`) · `pnpm format` (Prettier) |
| Architecture boundaries | `pnpm depcruise` (dependency-cruiser fitness functions — cross-package layering/team-split/dependency-root rules in [.dependency-cruiser.cjs](.dependency-cruiser.cjs); also run by `pnpm lint`) |
| Run the studio SPA | `pnpm dev` (builds `engine`, then runs `engine` watch + `studio` Vite dev server) |

**`prebuild` is not optional for a clean checkout.** `pnpm build` runs it automatically, but a bare `tsc -b` inside a package will fail without it. It does three codegen/fetch steps, all producing build artifacts you should regenerate rather than hand-edit:
- `fetch-langtags` downloads the pinned SIL `langtags.json` (MIT; SHA-256 pinned in [scripts/langtags-version.json](scripts/langtags-version.json); raw file gitignored under `packages/engine/data/langtags/`).
- `codegen-langtags` derives the slim lookup index into `packages/engine/src/langtags/generated/` from the downloaded data.
- `fetch-kmcmplib` downloads the pinned `kmcmplib.wasm` into `packages/compiler/wasm/` (SHA-256 pinned in `scripts/kmcmplib-version.json`). Set `KEYBOARD_STUDIO_KMCMPLIB_SOURCE=dev` to build it from a sibling `../keyman` checkout instead of downloading.
- `compile-recognizer-rules` codegens `content/recognizer-rules/*.yaml` → `packages/engine/src/recognizer/rules/generated/*.ts`.

**Running a subset of tests** (the test script in each package is `vitest run`):
- One package: `pnpm --filter @keyboard-studio/engine test`
- Watch a package: `pnpm --filter @keyboard-studio/engine test:watch`
- One file: `pnpm --filter @keyboard-studio/engine test src/codec/parse.test.ts`
- One test by name: append `-t "round-trips"`
- **Never run bare `vitest` at the repo root** — the root `vitest.config.ts` intentionally has an empty `include`; tests only resolve through each package's own config.

**E2E:** Playwright specs live under `packages/studio/e2e/`, but Playwright is not yet wired up — the specs are `.skip`-ped (each file carries the unblock recipe at the top).

## Repository status

**Day-1 contract is locked and the engine + studio are now built out** (this supersedes the earlier "contracts only" status). Packages under `packages/*`:

- **`@keyboard-studio/contracts`** — the locked Day-1 shared contract: TS types, the seven service interfaces + mocks, fixtures, the criteria catalog at `packages/contracts/data/criteria.json` (148 rows — 133 repo-hygiene + 12 §18 DISCUS design-heuristic at Day-1 lock, plus post-lock additions; see spec §11 and [docs/discus-principles-integration.md](docs/discus-principles-integration.md)), and the runtime **zod schemas** (`src/schemas.ts`) that mirror the locked `Pattern`/`Criterion` types. The dependency root — everything else builds to it.
- **`@keyboard-studio/engine`** — the real engine. Subsystems under `packages/engine/src/`: `codec` (.kmn ↔ KeyboardIR), `scaffolder`, `output` (VirtualFS → zip), `validator`, `compiler` (kmcmplib wrapper), `simulator`, `recognizer` (+ generated rules), `pattern-apply`, `pattern-library`, `strategy-selector`, `character-discovery`, `inventory`, `loader`, `base-browser`, `stub-mutator`, `langtags` (SIL langtags slim-index lookup; exposed as `@keyboard-studio/engine/langtags`).
- **`@keymanapp/keyboard-lint`** — Layer C hygiene lint engine (`lintEngine.ts`, `checks/`, `parsers/`).
- **`@keyboard-studio/llm`** — pluggable LLM client (`backends/`) for prompt-driven assistance.
- **`@keyboard-studio/studio`** — the React + Vite SPA (three-pane gallery / editor / preview; working-copy spine).
- **`packages/compiler`** — holds only the fetched `kmcmplib.wasm` (no TS `package.json`); the service wrapping it lives in `engine/src/compiler`.

Spec targets **not yet realised as written:** the `@keymanapp/kmn-validator` package has not been extracted — Layer A/B (and Layer A' import-fidelity) validation lives in `engine/src/validator` (see Architecture). Check a package's actual exports before referencing it.

**kbgen (placement seeder) — prototype, lives in `utilities/kbgen/`.** A standalone Node CLI that derives data-driven character placement (which key, which mechanism) from pinned Unicode/CLDR signals and emits a `placement-map.json`. Intended to become an engine deliverable (a seeder ahead of the survey, §8 Phase B), but it is CommonJS/plain-JS, does not conform to the `packages/contracts` types, and implements only S-01/S-08 of the §7.3 catalog. It is kept out of `packages/*` so it does not trip `pnpm -r`. Conformance path + open joint-session questions: [utilities/kbgen/INTEGRATION.md](utilities/kbgen/INTEGRATION.md). Do not treat it as a built package.

Keep this file's commands, package inventory, and architecture map in sync with reality as new packages land.

**Delivery-option progress lives in [`docs/github_flow.md`](docs/github_flow.md) — Status section.** Whenever work lands that advances Option A (user-fork/app-managed PR), Option B (org-mediated PR), or Option C (ZIP download), update that table and the progress bar before closing the issue or merging the PR. The scaffolder and VirtualFS serialisation rows in the prerequisites table also need updating as those land.

## Source of truth

- **`spec.md`** — the v1.3.1 spec (v1.0 signed off; v1.1.0 KeyboardIR import amendment applied 2026-06-08; v1.1.1 placement-priors amendment applied 2026-06-11; v1.2.0 hybrid-workflow + scoped-gallery amendment applied 2026-06-13, see [docs/workflow-model.md](docs/workflow-model.md) — typed assignment-map contract held for the #5b joint session; v1.3.0 working-copy spine + two authoring tracks amendment applied 2026-06-14 — single persistent working copy instantiated at keyboard selection via Track 1 `instantiateFromBase` or Track 2 `instantiateFromExisting`, all steps mutate it, serialized only at output; extends Decision 9; v1.3.1 defaults-first principle (§3c "Defaults are the product") + §8 defaults-audit follow-ups applied 2026-06-15 — propose-then-confirm everywhere, "no default is a defect"). Treat as authoritative for scope, schema, validator layering, team boundaries, and resolved decisions.
- **`docs/spec-signoff.md`** — review-cycle log and decision summary (D1–D9). Use this to see *why* a spec section reads the way it does before proposing changes.
- **`README.md`** — external-facing project description (what it is, status, layout, scope); keep it accurate and lean — don't expand without reason. The per-package inventory and build commands live here in CLAUDE.md; README points at this file rather than restating them.
- **`strategy tree/strategies.md`** — **superseded.** Merged into `spec.md §7`; now a stub pointer only. Do not edit it or treat it as a source.

**Contract source-of-truth chain (avoid divergent copies).** The `Pattern` / `Criterion` contract exists in several representations; this is their authority order, so edits land in the right place:
- **Canonical types:** `packages/contracts/src/pattern.ts`, `criteria.ts`. The TypeScript is the contract.
- **Runtime mirror:** `packages/contracts/src/schemas.ts` (zod). Bound to the canonical types by **compile-time drift guards** — the one *machine-enforced* link: change a type and its schema must change in the same commit or the build fails. The engine/studio loaders consume `RawPatternSchema` via `@keyboard-studio/engine/pattern-schema` (re-export, not a copy).
- **Prose spec:** [`specs/005-pattern-schema/spec.md`](specs/005-pattern-schema/spec.md) (§5, extracted). The **Day-1 reference** — illustrative, may lag the code's non-breaking optional fields; not a second source. Field renames/type changes/removals are a locked-contract change (§18).
- **Criteria data + count:** `packages/contracts/data/criteria.json` is the data; the per-band recompute lives in `criteria-summary.md`; the count (148; 40/66/32/10) is **enforced** by `packages/contracts/src/{types,schemas}.test.ts`. Prose mentions (spec §11, this file, README) cross-link rather than re-derive.

**Relationship between `spec.md` and `strategies.md` (resolved — merged).** The two documents have been unified: the `.kmn` strategy framework (seven discovery axes A1–A7, the decision tree, the S-01…S-12 strategy catalog, building blocks, and the validation table) now lives in **`spec.md` Section 7 (Strategy selection)**. It is wired into the rest of the spec: the survey computes the axes (§7.1), the strategy selector runs the decision tree (§7.2) to pick a strategy, and each `Pattern` (§5) links to its strategy card via the (ratified) optional `strategyId` / `combinesWith` fields. The §7.5 validation table is a self-consistency regression suite — two intentional v1.1 gaps (EuroLatin, IPA) are documented; keep §7.1/§7.2/§7.3 and that table mutually consistent across any edit.

The spec embeds external docs by reference (Sec 19): `docs/KM-Questionnaire.md`, `docs/lint.md`, `docs/criteria.md`, `docs/making-a-template.md`. These live in the planned repo layout but are not yet in this working copy — fetch from `https://github.com/keyboard-studio/keyboard-studio` if needed.

**Keyboard phonebook.** When you need to locate or look up a keyboard this project references — by name, language, author, or where its source lives on disk — consult [docs/keyboard-index.md](docs/keyboard-index.md) **first**. It maps each acknowledged keyboard to its BCP47 languages, author, and relative path. The keyboards themselves live in the sibling `keymanapp/keyboards` checkout at `../keyboards`, not in this repo. **Keeping the phonebook current is mandatory, not optional:** it indexes only keyboards already referenced, so whenever you introduce, cite, or otherwise reference a keyboard that is not yet in the table, you MUST add its row in the same change (read the keyboard's `<id>.kps` for name, BCP47 languages, and author — see the "Keep this current" recipe in that file). Treat a stale phonebook as a defect.

## Architecture

`spec.md` is authoritative for *intended* design; this is how it maps to the code that exists. These are the cross-cutting invariants that require reading several files to see — honour them, and surface deviations rather than inventing new ones.

- **Codec / `KeyboardIR` is the spine of the engine.** `engine/src/codec` parses `.kmn` into a typed `KeyboardIR` (`parse.ts` / `tokenize.ts`), emits it back (`emit.ts`), and round-trips (`roundtrip.test.ts`). Scaffolding, import, validation, and mutation all operate on the IR, not on raw `.kmn` text — e.g. `scaffold()` is `parse → scaffoldIR → emit`. Constructs the codec can't model are preserved as opaque `RawKmnFragment` nodes (the type is defined in `@keyboard-studio/contracts`; reasons are catalogued in `engine/src/codec/opaque-reasons.ts`), never silently dropped. A base the codec can't parse fails the whole scaffold (no try/catch around `parse()`), so "codec-clean" matters when choosing a base.
- **Working-copy spine (spec v1.3.0).** A single persistent working copy is instantiated when the user picks a keyboard — Track 1 `instantiateFromBase` (copy/adapt) or Track 2 `instantiateFromExisting` (import). Every step mutates that one copy; it is serialized only at output. See [docs/workflow-model.md](docs/workflow-model.md).
- **Validator layering (spec §10).** Three layers — Layer A validity + Layer B style + Layer C hygiene; Layer A is 9 TS-portable checks + 5 WASM-only (spec §10 has the per-check `kmcmplib` source references). **In code:** Layer A/B — plus the Layer A' import-fidelity checks I1–I6 (`engine/src/validator/layer-a-prime.ts`, `index-import-fidelity.ts`) — live in `engine/src/validator`; Layer C is `@keymanapp/keyboard-lint`. (The spec's `@keymanapp/kmn-validator` package has not been extracted yet.)
- **Single 300 ms debounce cycle (decision D3).** In the studio, the TS-check and the WASM `kmcmplib` oracle run as concurrent microtasks within one debounce cycle. Do not introduce a second debounce timer.
- **Virtual FS (spec §11).** All authoring happens in an in-memory FS mirroring the `keymanapp/keyboards` layout; serialized at output to a `.zip` (`engine/src/output`) or committed via GitHub OAuth fork+PR. The studio never writes to host disk during authoring.
- **Two teams (spec §12).** Engine owns the SPA, scaffolder, compiler service, validator, output paths. Content owns the pattern library, survey text, gallery ordering, LLM prompts, and criteria triage. Respect the split when picking up work.
- **Standalone utilities.** `utilities/*` (kbgen, supportability-scanner, smoke-artifact, spec-trace, km-triage-app, Template Cleanup) are deliberately kept out of `packages/*` so they don't trip `pnpm -r`; run them with `tsx` (see each tool's tsconfig). Do not treat them as built workspace packages.

## Pattern schema is a contract

The `Pattern` TS interface in spec Sec 5 is the Day-1 contract (issue #5). Treat its field names, types, and `{{slotId}}` placeholder syntax as locked. Per the revision policy (Sec 17):

- Prose section edits — single-reviewer approval.
- `Pattern` schema field renames/type changes/removals — major version bump of `packages/contracts` + joint engine+content session.
- Reopening a resolved decision (D1–D9, Sec 14) — explicit revision request citing original decision and new evidence; **not** informal.

If a task seems to require schema-breaking changes, surface this to the user before editing — don't change the schema silently.

**Runtime enforcement.** The locked types are mirrored by zod schemas in `packages/contracts/src/schemas.ts` (`PatternSchema`, `CriterionSchema`, plus the YAML-tolerant `RawPatternSchema` the engine/studio loaders consume via `@keyboard-studio/engine/pattern-schema`). The data-file boundaries parse through them — `criteria.json` in `criteriaData.ts`, pattern YAML in the engine loader — so malformed records fail loudly. **The hand-written interfaces stay canonical; the schemas mirror them.** Compile-time drift guards in `schemas.ts` fail the build if a schema and its interface diverge, so editing a locked type means editing its schema in the same change.

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

## Spec-kit (spec-driven feature loop)

[spec-kit](https://github.com/github/spec-kit) provides the **per-feature** generative loop that sits *below* the monolithic [spec.md](spec.md). It is installed in `.specify/` (templates, scripts, `memory/constitution.md`) with the skills under `.claude/skills/speckit-*`. The CLI version is pinned in [scripts/spec-kit-version.json](scripts/spec-kit-version.json) — re-run `specify init --here` only after deliberately bumping that pin.

**Section-by-section spec extraction (in progress, 2026-06-15→).** The monolithic `spec.md` is being migrated into `specs/NNN-<slug>/` folders one numbered section at a time, where `NNN` mirrors the spec.md section number (e.g. `specs/007-strategy-selection/` for §7). **The extracted folder is authoritative for its section once landed; `spec.md` keeps a stub pointer.** Sections not yet extracted remain authoritative in `spec.md`. The reference-only sections (§14 resolved decisions, §17 glossary, §18 revision policy, §19 reference) are not planned for extraction. Extracted so far: §7 (pilot, 2026-06-15), §8 (2026-06-15), §5 (Pattern schema, 2026-06-16).

**Not everything is a feature — don't shred the architecture.** Only *feature / contract* sections extract into `specs/NNN/`. The **architecture-core** sections — §4 (system overview), §5a (KeyboardIR spine), §9 (routing), §10 (validator layering), §11 (criteria model), §12/§13 (output + team boundaries) — describe how the whole tool composes; they are **not** features and stay authoritative in `spec.md`, composed (with links to code + the extracted feature specs) in [docs/architecture.md](docs/architecture.md), the system/meta-flow layer. (§8 Data flow was extracted before this rule; it is the meta-flow and is treated as architecture-core wherever its text lives.) `docs/architecture.md` is the home for "how the tool works"; `spec.md` architecture-core sections are its detail; `constitution.md` holds the invariant rules. When deciding whether to extract a section, ask: *feature/contract → `specs/NNN`; architecture/meta-flow → stays, composed in `docs/architecture.md`; reference → stays.*

**New features still get their own `specs/NNN-<slug>/`** with a creation-order `NNN`, and **cite the governing `spec.md §X` (or its extracted folder)** rather than re-deriving scope. The mirror-numbering convention only applies to spec sections being extracted — new features pick the next free `NNN` above the extracted-section range.

- **`.specify/memory/constitution.md`** restates the locked gates (Pattern schema, KeyboardIR spine, working-copy spine, validator layering, VirtualFS, team boundaries, out-of-scope, conventions) so `/speckit-plan`'s Constitution Check enforces them mechanically. It does **not** amend the spec — on conflict `spec.md` + [docs/spec-signoff.md](docs/spec-signoff.md) win.
- **Workflow:** `/speckit-specify` (+ `/speckit-clarify`) → `/speckit-plan` (Constitution Check) → `/speckit-tasks` → `/speckit-taskstoissues`, then `/km-lead` dispatches the crew against the tasks. `/speckit-analyze` runs as a `km-doc`/`km-synthesis` review check before `/speckit-implement`.
- **Drift split:** `utilities/spec-trace` owns textual drift of the spec corpus — the monolith `spec.md` sections, the extracted feature specs (`specs/NNN/spec.md`), and the architecture/meta-flow doc (`docs/architecture.md`); it hashes each unit and flags un-acknowledged changes (`node utilities/spec-trace check|report|acknowledge`). `/speckit-analyze` owns per-feature `spec ↔ plan ↔ tasks` consistency. Do **not** install spec-kit's "Spec Trace" community extension — it duplicates the existing utility.

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
