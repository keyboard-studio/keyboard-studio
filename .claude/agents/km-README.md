---
name: km-README
description: Roster reference for the KM crew. Explains who is on the crew, what each agent does, when to invoke each. Read-only lookup tool.
tools: Read, Grep, Glob
model: haiku
---
# KM Team — Code & Spec Review Crew

The review crew for the keyboard-studio project. Installed at `.claude/agents/km-*.md` and dispatched via `.claude/commands/km-*.md` slash commands.

Originally adapted from the flexlibs2 LEX crew (May 2026); rebuilt for keyboard-studio in June 2026 with project-specific seats (km-keyman, km-strategy, km-validator, km-output, km-frontend, km-testing) and the km-author / km-domain seats repointed to speak for keymanapp/keyman and general linguistics respectively.

## Roster

| Slash command | Role | Key output |
|---|---|---|
| `/km-lead` | Planning, coordination, final approval | Approval decision with rationale; `dispatch_plan` blocks |
| `/km-programmer` | General implementation specialist | Working code that meets requirements |
| `/km-frontend` | SPA implementation (TS + React + Vite) | UI code respecting the 300 ms cycle, VFS, OAuth flow |
| `/km-testing` | Test-suite author (vitest + Playwright) | New / maintained tests; fixture management |
| `/km-verification` | Completeness + correctness validation for a specific change | Verification report (pass/fail) with pre/post evidence |
| `/km-qc` | Code quality + standards enforcement | QC report with quality score |
| `/km-simplify` | Post-goal refactor via Claude's `/simplify` | Simplify report + behavior-preserving diff |
| `/km-keyman` | Keyman / .kmn / kmcmplib domain expert | Review against the 14 compiler checks, .kmn idioms, layout |
| `/km-domain` | Master linguist (scripts, normalization, IPA, RTL) | Linguistic correctness review |
| `/km-strategy` | §7 strategy framework (axes A1-A7, tree, S-01..S-12) | Tree/catalog/table coherence review |
| `/km-validator` | Validator-layer architecture (A/B/C, debounce, kmcmplib boundary) | Layer-boundary / timing review |
| `/km-output` | Scaffolder / VirtualFS / GitHub PR delivery | Output-shape / upstream-conformance review |
| `/km-author` | keymanapp/keyman parity — voice, conventions, vocabulary | Upstream-parity review |
| `/km-doc` | Documentation maintenance (docs/, module docstrings) | Doc updates synced to code |
| `/km-archivist` | Git/GitHub manager + historical record | Commits, PRs, releases, history reports |
| `/km-synthesis` | Aggregates specialist reports into a unified verdict | Synthesis report |

## When to invoke each

- **`/km-programmer`** — general implementation work (contracts, scaffolder, engine, validator, CLI). Backend / non-SPA TypeScript.
- **`/km-frontend`** — anything inside `packages/studio/`: components, hooks, debounce integration, VFS state, OAuth UI, three-pane editor.
- **`/km-testing`** — writing or maintaining tests. The 101+ vitest baseline, Playwright E2E, the kmcmplib baseline cross-validation, the §7.5 regression-table runner, 300 ms timing specs.
- **`/km-verification`** — confirming a specific change does what it claims to. Runs tests, gathers evidence, emits pass/fail. (Sequential after `/km-testing` for new test coverage.)
- **`/km-qc`** — code quality, style, complexity, error handling. General review.
- **`/km-simplify`** — *after* a goal is met and tests are green, clean up reuse/quality/efficiency issues. Always hands off to `/km-verification` afterward.
- **`/km-keyman`** — anything touching `.kmn` content: Pattern.kmnFragment, Pattern.reorderRules, scaffolder-emitted KMN, validator Layer-A check implementations, the 14 compiler checks, output-layout conformance for `.kmn` / `.kps` / `.kvks` / etc.
- **`/km-domain`** — script, normalization, IPA, RTL/LTR, complex shaping, phonetic-mapping conventions, Pattern.description / .validatedForFamilies sanity. Anything where "is this the right linguistic answer?" matters.
- **`/km-strategy`** — edits to spec.md §7 (any subsection), changes to the survey question prose, new patterns with `strategyId` / `combinesWith`, gallery ordering rules. The §7.5 regression table is its watch.
- **`/km-validator`** — validator-package changes, Layer A/B/C boundary decisions, TS-portable vs WASM-only check assignment, 300 ms debounce or TS/WASM concurrency changes.
- **`/km-output`** — scaffolder output, VirtualFS mutations, .zip serialization, GitHub OAuth fork+PR flow, keymanapp/keyboards layout conformance, LICENSE/HISTORY/README exact-syntax.
- **`/km-author`** — review against keymanapp/keyman upstream conventions: commit/issue style (`<prefix>(<area>): <description>`), .kmn idioms (`any(store)`, `RALT` not `ALT`), Keyman vocabulary ("touch layout" not "mobile keyboard"), `packages/contracts` API stability (§17).
- **`/km-doc`** — documentation drift, module docstrings, `docs/` consistency with code.
- **`/km-archivist`** — committing, opening PRs, cutting releases, investigating git history, keeping CHANGELOG / migration guides honest.
- **`/km-synthesis`** — end of a review cycle, when multiple specialists have reported and need to be reconciled.
- **`/km-lead`** — anything requiring multi-agent coordination.

## How `/km-lead` actually dispatches

`/km-lead` runs as a subagent and **cannot call the `Agent` tool itself** — only the main Claude Code session can spawn subagents. The lead doesn't dispatch the crew directly; it emits a structured `dispatch_plan` YAML block at the end of its response, and the main session parses that block and fires the `Agent` calls.

Round-trip per cycle:

1. Main session invokes `/km-lead` with the task.
2. Lead returns a plan + `dispatch_plan` block (parallel groups run concurrently, sequential groups serialize).
3. Main session executes the plan, collects specialist reports.
4. Main session re-invokes `/km-lead` with the reports.
5. Repeat until lead returns a response with **no** `dispatch_plan` block — that's the final approval/rejection.

Full contract is in `.claude/agents/km-lead.md`; the main-session executor protocol is in the user's global `~/.claude/CLAUDE.md` under "LEX Crew Dispatch Protocol" (the global protocol still uses the LEX name; the agents in this project are named KM).

## Typical workflows

```
SPA feature work:
  /km-lead -> /km-frontend (implement)
           -> /km-testing (vitest + Playwright)
           -> /km-verification (run + verify)
           -> { /km-qc, /km-keyman (if .kmn touched), /km-author } in parallel
           -> /km-synthesis -> /km-lead (approval)
           -> /km-archivist (commit + PR)

Validator change:
  /km-lead -> /km-programmer (or /km-frontend if UI side)
           -> /km-validator (layer-boundary review)
           -> /km-keyman (compiler-check fidelity)
           -> /km-testing (timing specs + baseline cross-val)
           -> /km-verification
           -> /km-synthesis -> /km-lead -> /km-archivist

§7 / strategy / pattern change:
  /km-lead -> /km-programmer (contracts/data edit)
           -> /km-strategy (tree/catalog/§7.5 coherence)
           -> /km-domain (linguistic sanity)
           -> /km-keyman (if Pattern.kmnFragment touched)
           -> /km-testing (regression-table update)
           -> /km-verification
           -> /km-synthesis -> /km-lead -> /km-archivist

Output / scaffolder change:
  /km-lead -> /km-programmer
           -> /km-output (layout + delivery review)
           -> /km-author (upstream conformance)
           -> /km-keyman (if .kmn-emitting)
           -> /km-testing
           -> /km-verification
           -> /km-synthesis -> /km-lead -> /km-archivist

History / commit investigation (standalone):
  /km-archivist  (no review cycle needed)
```

`/km-archivist` is the only crew member that runs `git commit` / `gh pr create`. All other agents read and review but never touch git directly.

`/km-simplify` is gated by verification: it never lands its own work — it always hands off to `/km-verification` for a second pass that confirms the refactor breaks nothing.

## Project-specific seats vs. generic crew

Generic seats (apply to any TypeScript project): `/km-lead`, `/km-programmer`, `/km-verification`, `/km-qc`, `/km-simplify`, `/km-doc`, `/km-archivist`, `/km-synthesis`.

keyboard-studio-specific seats: `/km-frontend`, `/km-testing`, `/km-keyman`, `/km-domain`, `/km-strategy`, `/km-validator`, `/km-output`, `/km-author` (the last one is generic in shape but speaks specifically for keymanapp/keyman).

If you fork this crew into another project, the project-specific seats are the ones to re-aim or replace.

## Status

**Active project crew** for keyboard-studio (June 2026).
**Origin:** adapted from flexlibs2 LEX crew (Nov 2025), moved to global as LEX crew (May 2026), forked to keyboard-studio and renamed/specialized June 2026.
