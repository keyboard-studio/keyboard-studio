---
name: km-README
description: Roster reference: explains who is on the KM crew, what each agent does, when to invoke each. Read-only lookup tool.
tools: Read, Grep, Glob
model: haiku
---
# KM Team — Code Review Crew (Global)

A code-review team of 9 personas, installed at `~/.claude/commands/km-*.md`. Sister to the Babel server team (`/boss` and friends), but a **separate org** — see "Why not under /boss?" below.

Originally developed in the flexlibs2 v2.0.0 refactoring project (`D:\Github\_Projects\_LEX\flexlibs2\agents\`); moved here on 2026-05-20 to live globally alongside the Babel crew. `/km-archivist` was added later to handle git/GitHub work that the original seven didn't cover.

## Roster

| Slash command | Role | Key output |
|---|---|---|
| `/km-lead` | Planning, coordination, final approval | Approval decision with rationale |
| `/km-programmer` | Implementation specialist | Working code that meets requirements |
| `/km-simplify` | Post-goal refactor via Claude's `/simplify` | Simplify report + behavior-preserving diff |
| `/km-verification` | Completeness + correctness validation | Verification report (pass/fail) |
| `/km-qc` | Code quality + standards enforcement | QC report with quality score |
| `/km-domain` | Domain correctness (linguistics, FLEx, LCM) | Domain expert review |
| `/km-author` | Philosophy, style, backward compatibility | Author perspective review |
| `/km-synthesis` | Pattern analysis, lessons learned | Synthesis report |
| `/km-archivist` | Git/GitHub manager + historical record | Clean commits, PRs, releases, history reports |

## When to use each

- **`/km-programmer`** — implementation tasks, bug fixes, feature development.
- **`/km-simplify`** — *after* a goal is met and tests are green, run Claude's `/simplify` to clean up reuse/quality/efficiency issues. Hands off to `/km-verification` to confirm nothing broke.
- **`/km-verification`** — checking completeness, testing coverage, API compatibility.
- **`/km-qc`** — code quality review, standards enforcement.
- **`/km-domain`** — projects with specialized domain knowledge (linguistics for FLEx work). Customize per project.
- **`/km-author`** — refactoring existing codebases, preserving design philosophy.
- **`/km-synthesis`** — end of implementation phase, pattern analysis, lessons learned.
- **`/km-archivist`** — committing, opening PRs, cutting releases, investigating git history ("when did X change?"), keeping CHANGELOG/migration guides honest.
- **`/km-lead`** — anything requiring multi-agent coordination.

## How `/km-lead` actually dispatches

`/km-lead` runs as a subagent and **cannot call the `Agent` tool itself** — only the main Claude Code session can spawn subagents. So the lead doesn't dispatch the crew directly; it emits a structured `dispatch_plan` YAML block at the end of its response, and the main session parses that block and fires the `Agent` calls.

Round-trip per cycle:

1. Main session invokes `/km-lead` with the task.
2. Lead returns a plan + `dispatch_plan` block (parallel groups run concurrently, sequential groups serialize).
3. Main session executes the plan, collects specialist reports.
4. Main session re-invokes `/km-lead` with the reports.
5. Repeat until lead returns a response with **no** `dispatch_plan` block — that's the final approval/rejection.

Full contract is in `~/.claude/agents/km-lead.md`; the main-session executor protocol is in `~/.claude/CLAUDE.md` under "KM Crew Dispatch Protocol". The workflow diagrams below describe the **logical** flow; physically, every arrow into a non-lead agent goes via a `dispatch_plan` block parsed by the main session, and every arrow back to `/km-lead` is a re-invocation carrying the prior cycle's reports.

## Workflows

`/km-lead` orchestrates one of three flows (full detail in `km-lead.md`):

```
Sequential (comprehensive):
  /km-lead -> /km-programmer -> /km-verification -> /km-simplify -> /km-verification
              -> /km-qc -> /km-domain + /km-author (parallel)
              -> /km-synthesis -> /km-lead (approval)
              -> /km-archivist (commit + PR + docs)

Parallel review (faster):
  /km-lead -> /km-programmer -> /km-verification -> /km-simplify -> /km-verification
              -> { /km-qc, /km-domain, /km-author } in parallel
              -> /km-synthesis -> /km-lead -> /km-archivist

Iterative (quality-critical):
  /km-lead -> /km-programmer -> /km-qc -> fix -> /km-qc -> ... -> approve
              -> /km-simplify -> /km-verification -> /km-archivist

Archivist also operates standalone:
  /km-archivist  (history investigations, release cuts, doc sync — no review cycle needed)

Simplify is gated by verification:
  /km-simplify never lands its own work — it always hands off to /km-verification
  for a second pass that confirms the refactor breaks nothing.
```

`/km-archivist` always lands work — it's the only crew member that runs `git commit` / `gh pr create`. Other agents read and review but never touch git directly.

## Why not under `/boss`?

`/boss` (also global) runs a **Linux DevOps crew** for the Babel server (langtech.cloud): Ziva (security), Parker (users), Scotty (uptime), Data (LLM stack), Jack (logs), McGee (webmaster), etc. Their world is `docker compose`, `nginx -s reload`, fail2ban, and `/home/lee2mr/...` paths.

`/km-lead` runs an **abstract Python code-review process** — scored review reports, backward-compatibility checks, FLEx/LCM API correctness. The two teams:

- Share no tools (`/boss` runs bash on a Linux server; `/km-lead` reads source code and produces scored reviews)
- Share no environment (`/boss` is Linux-locked; `/km-lead` is mostly used inside `D:\Github\_Projects\_LEX\` on this Windows box)
- Share no deliverables (operational outcomes vs. review reports)
- Share no personas (NCIS/Trek characters vs. abstract dev roles)

Keeping them parallel ‑‑ `/boss` for server work, `/km-lead` for code review ‑‑ is cleaner than nesting one under the other. The `km-` prefix is the namespace separator.

## Where these files come from

The 7 persona files were authored during the flexlibs2 refactoring project and tuned for Python/FLEx code review. They retain that flavor (e.g. the linguistics example in `/km-domain`). To adapt for non-FLEx projects, see the "Customization Guide" sections inside each file.

## Customizing for a project

Each agent supports per-project customization:

1. **`/km-domain`** — replace "linguistics" with your domain (finance, healthcare, etc.); update terminology standards; modify workflow examples.
2. **`/km-author`** — define the project's "philosophy" (style guide, design principles, team conventions).
3. **Quality thresholds** in `/km-lead` — adjust acceptable scores (e.g., QC >= 85/100), coverage requirements, blocking vs. non-blocking issue rules.
4. **Workflows** in `/km-lead` — choose sequential vs. parallel vs. iterative.

## Multi-agent benefits

1. **Comprehensive coverage** — each agent brings a unique perspective.
2. **Separation of concerns** — clear responsibilities reduce overlap.
3. **Quality gating** — multiple checkpoints catch different issues.
4. **Documented process** — agent reports create an audit trail.
5. **Reusable patterns** — lessons learned documented systematically.

---

**Status:** Production-ready agent personalities
**Originally documented:** 2025-11-24 (flexlibs2 v2.0.0 refactoring)
**Moved to global commands:** 2026-05-20
