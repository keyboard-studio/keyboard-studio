# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file is loaded into **every** session, so it holds only what you need *before* you know
what to look up: the gates, the cross-cutting invariants, and where everything else lives.
Reference detail lives in [docs/tooling.md](docs/tooling.md) (build/test/lint/E2E),
[docs/packages.md](docs/packages.md) (what each package owns), and
[docs/architecture.md](docs/architecture.md) (how they compose). Search those rather than
reading them.

## Finding things

The spec corpus is ~5.4 MB across ~430 markdown files under `specs/**` and `docs/**`. **Search
it; don't read it.**

```
pnpm run spec-search "remove key confirmation dialog"
pnpm run spec-search "touch layout" --scope specs/058-touch-key-editor --limit 8
```

Every hit returns `path:line` plus its heading breadcrumb, annotated with the spec-trace review
status of the unit it came from. If a snippet isn't enough, `Read` that file **at that offset** —
opening the whole file spends the tokens the search just saved. Output is byte-capped (default
2048; `--budget` to change). Details in [docs/tooling.md](docs/tooling.md#searching-the-corpus).

For keyboards specifically, [docs/keyboard-index.md](docs/keyboard-index.md) is the phonebook —
see below.

## Commands

Package manager is **pnpm 9**, Node **≥ 22.19.0** (hard floor — an older Node makes `lingui`
subcommands exit 0 having done nothing). Run from the repo root unless noted.

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build everything | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Test everything | `pnpm test` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Run the studio SPA | `pnpm dev` |
| Search the spec corpus | `pnpm run spec-search "<query>"` |
| One package's tests | `pnpm --filter @keyboard-studio/engine test` |

Two things that will bite you:

- **Never run bare `vitest` at the repo root.** The root `vitest.config.ts` intentionally has an
  empty `include`; tests only resolve through each package's own config. Suites outside the
  workspace (`/api`, the i18n utilities, spec-trace) each need their own invocation — see
  [docs/tooling.md](docs/tooling.md#running-a-subset-of-tests).
- **`prebuild` is not optional for a clean checkout.** `pnpm build` runs it automatically, but a
  bare `tsc -b` inside a package will fail without it. It fetches pinned upstream data
  (langtags, SLDR, CLDR, Glottolog) and codegens several artifacts — regenerate them, never
  hand-edit. See [docs/tooling.md](docs/tooling.md#prebuild).

`pnpm lint` chains ESLint, `depcruise`, and nine plain-node checkers (crew files, facet records,
the facet index, adaptation catalogs, both i18n tiers, test antipatterns). Run `pnpm crew-lint`
after touching any `.claude/**/km-*` file — every drift class it catches has shipped before.
Full list: [docs/tooling.md](docs/tooling.md#what-pnpm-lint-actually-runs).

## Repository status

Day-1 contract is locked; the engine and studio are built out. Packages: `contracts` (the
dependency root — types, service interfaces, criteria catalog, zod schemas), `engine` (codec,
scaffolder, output, validator, compiler, simulator, recognizer, and more), `keyboard-lint`
(Layer C), `llm`, `glottolog`, `studio` (React + Vite SPA). Per-package detail:
[docs/packages.md](docs/packages.md).

**Check a package's actual exports before referencing it** — some spec targets are not realised
as written. Notably the `@keymanapp/kmn-validator` package has not been extracted; Layer A/B
validation lives in `engine/src/validator`.

## Source of truth

- **[spec.md](spec.md)** — the v1.3.1 spec. Authoritative for scope, schema, validator layering,
  team boundaries, and resolved decisions. Amendment history: v1.1.0 KeyboardIR import
  (2026-06-08); v1.1.1 placement priors (2026-06-11); v1.2.0 hybrid workflow + scoped gallery
  (2026-06-13, see [docs/workflow-model.md](docs/workflow-model.md)); v1.3.0 working-copy spine +
  two authoring tracks (2026-06-14); v1.3.1 defaults-first — §3c "Defaults are the product",
  propose-then-confirm everywhere, "no default is a defect" (2026-06-15).
- **[docs/spec-signoff.md](docs/spec-signoff.md)** — review-cycle log and decision summary
  (D1–D9). Read this to see *why* a spec section reads the way it does before proposing changes.
- **[README.md](README.md)** — external-facing description. Keep it accurate and lean; the
  package inventory and build commands live in `docs/`, not there.
- **`strategy tree/strategies.md`** — **superseded**, now a stub pointer. Do not edit it or treat
  it as a source. Its content merged into **spec.md §7** (extracted to
  [specs/007-strategy-selection/](specs/007-strategy-selection/)). §7.1/§7.2/§7.3 and the §7.5
  validation table are mutually consistent by design — keep them that way across any edit; the
  table is a self-consistency regression suite with two documented v1.1 gaps (EuroLatin, IPA).

The spec embeds external docs by reference (§19): `docs/KM-Questionnaire.md`, `docs/lint.md`,
`docs/criteria.md`, `docs/making-a-template.md`.

### Contract source-of-truth chain

The `Pattern` / `Criterion` contract exists in several representations. This is their authority
order, so edits land in the right place:

- **Canonical types:** `packages/contracts/src/pattern.ts`, `criteria.ts`. The TypeScript *is*
  the contract.
- **Runtime mirror:** `packages/contracts/src/schemas.ts` (zod). Bound to the canonical types by
  **compile-time drift guards** — the one *machine-enforced* link: change a type and its schema
  must change in the same commit or the build fails. Engine/studio loaders consume
  `RawPatternSchema` via `@keyboard-studio/engine/pattern-schema` (re-export, not a copy).
- **Prose spec:** [specs/005-pattern-schema/spec.md](specs/005-pattern-schema/spec.md) (§5,
  extracted). The Day-1 reference — illustrative, may lag the code's non-breaking optional
  fields; not a second source.
- **Criteria data + count:** `packages/contracts/data/criteria.json` is the data; the per-band
  recompute lives in `criteria-summary.md`. The current count (148; 40/66/32/10) is
  **descriptive and expected to grow**. Tests enforce schema-validity of every row and the
  four-band partition invariant (sum of band counts === total, no orphans) — **not** the literal
  cardinality. Prose mentions cross-link rather than re-derive.

### Keyboard phonebook

When you need to locate or look up a keyboard this project references — by name, language,
author, or where its source lives on disk — consult
[docs/keyboard-index.md](docs/keyboard-index.md) **first**. It maps each acknowledged keyboard to
its BCP47 languages, author, and relative path.

The keyboards themselves live in the sibling `../keyboards` checkout, not in this repo. That
checkout tracks the [keyboard-studio/keyboards](https://github.com/keyboard-studio/keyboards)
fork (a stable mirror of `keymanapp/keyboards`) — the project's canonical corpus for
deterministic tests and facet-index builds. Point `../keyboards` at that fork's `master`, not
upstream, or corpus-calibrated tests (e.g. the recognizer `basic_kbdfr` fixtures) will drift.

**Keeping the phonebook current is mandatory.** It indexes only keyboards already referenced, so
whenever you introduce, cite, or otherwise reference a keyboard not yet in the table, you MUST
add its row in the same change (read the keyboard's `<id>.kps` for name, BCP47 languages, and
author — see the "Keep this current" recipe in that file). Treat a stale phonebook as a defect.

## Architecture invariants

[spec.md](spec.md) is authoritative for *intended* design and
[docs/architecture.md](docs/architecture.md) composes it against the code. These are the
cross-cutting invariants you cannot see by reading any single file — honour them, and surface
deviations rather than inventing new ones.

- **Codec / `KeyboardIR` is the spine of the engine.** `engine/src/codec` parses `.kmn` into a
  typed `KeyboardIR` (`parse.ts` / `tokenize.ts`), emits it back (`emit.ts`), and round-trips
  (`roundtrip.test.ts`). Scaffolding, import, validation, and mutation all operate on the IR, not
  on raw `.kmn` text — e.g. `scaffold()` is `parse → scaffoldIR → emit`. Constructs the codec
  can't model are preserved as opaque `RawKmnFragment` nodes (type defined in
  `@keyboard-studio/contracts`; reasons catalogued in `engine/src/codec/opaque-reasons.ts`),
  never silently dropped. A base the codec can't parse fails the whole scaffold (no try/catch
  around `parse()`), so "codec-clean" matters when choosing a base.
- **Working-copy spine (spec v1.3.0).** A single persistent working copy is instantiated when the
  user picks a keyboard — Track 1 `instantiateFromBase` (copy/adapt) or Track 2
  `instantiateFromExisting` (import). Every step mutates that one copy; it is serialized only at
  output. See [docs/workflow-model.md](docs/workflow-model.md).
- **Validator layering (spec §10).** Three layers — Layer A validity + Layer B style + Layer C
  hygiene; Layer A is 9 TS-portable checks + 5 WASM-only (spec §10 has the per-check `kmcmplib`
  source references). **In code:** Layer A/B — plus the Layer A' import-fidelity checks I1–I6
  (`engine/src/validator/layer-a-prime.ts`, `index-import-fidelity.ts`) — live in
  `engine/src/validator`; Layer C is `@keymanapp/keyboard-lint`.
- **Single 300 ms debounce cycle (decision D3).** In the studio, the TS-check and the WASM
  `kmcmplib` oracle run as concurrent microtasks within one debounce cycle. Do not introduce a
  second debounce timer. **Scope:** D3 governs the *validation* cycle — anything that produces
  diagnostics from the working copy. It does not reach persistence or network-sync timers (e.g.
  `AUTOSAVE_DEBOUNCE_MS` and `CLOUD_SYNC_DEBOUNCE_MS` in
  [packages/studio/src/lib/draftPersistence.ts](packages/studio/src/lib/draftPersistence.ts)),
  which race nothing and emit no diagnostics. A new timer needs D3 sign-off when it validates;
  not when it merely saves.
- **Virtual FS (spec §11).** All authoring happens in an in-memory FS mirroring the
  `keymanapp/keyboards` layout; serialized at output to an installable `.kmp` (the primary
  download) or a source `.zip` (`engine/src/output`), or committed via GitHub OAuth fork+PR. The
  studio never writes to host disk during authoring. **Compiled artifacts are staged on the
  download path only** ([packages/studio/src/lib/buildOutputBundle.ts](packages/studio/src/lib/buildOutputBundle.ts)),
  never inside the shared projection — the PR paths read that same projection, and a community PR
  must not carry `build/` output or a `.kmp` (criteria SS1). `buildKmp` likewise stages into a
  clone, so the caller's VFS is never mutated.
- **Co-located Vercel functions under `/api` must stay bundle-safe.** The serverless functions
  (`rewrites` in [vercel.json](vercel.json)) live outside the pnpm workspace but reach
  `utilities/oauth-backend/src` by relative path, so their whole reachable module graph gets
  traced into a **function bundle** rather than resolved as a workspace build. **A module in that
  graph must not import a `@keyboard-studio/*` package as a value** — the contracts barrel
  re-exports data modules that load JSON from `packages/contracts/data/`, a path outside the
  emitted `dist/` that does not survive bundling. This fails at ESM *module load*, so the handler
  never runs and every route returns a platform-level `FUNCTION_INVOCATION_FAILED` (text/plain)
  instead of a JSON error — an outage, not a degraded response. `import type` is erased and
  always fine; when a *value* is genuinely shared, copy the literal locally behind a compile-time
  drift guard (see `GITHUB_OAUTH_CLIENTS` in
  [utilities/oauth-backend/src/schemas.ts](utilities/oauth-backend/src/schemas.ts)). Enforced by
  [api/bundle-safety.test.ts](api/bundle-safety.test.ts); `/api` is outside `pnpm -r`, so it runs
  via its own CI step.
- **Two teams (spec §12).** Engine owns the SPA, scaffolder, compiler service, validator, output
  paths. Content owns the pattern library, survey text, gallery ordering, LLM prompts, and
  criteria triage. Respect the split when picking up work.
- **Standalone utilities.** `utilities/*` is deliberately kept out of `packages/*` so it doesn't
  trip `pnpm -r`. Do not treat them as built workspace packages. Inventory and run instructions:
  [docs/tooling.md](docs/tooling.md#standalone-utilities).

## Pattern schema is a contract

The `Pattern` TS interface in spec §5 is the Day-1 contract. Treat its field names, types, and
`{{slotId}}` placeholder syntax as locked. Per the revision policy (§17):

- Prose section edits — single-reviewer approval.
- `Pattern` schema field renames/type changes/removals — major version bump of
  `packages/contracts` + joint engine+content session.
- Reopening a resolved decision (D1–D9, §14) — explicit revision request citing original decision
  and new evidence; **not** informal.

**If a task seems to require schema-breaking changes, surface this to the user before editing —
don't change the schema silently.**

Runtime enforcement: the locked types are mirrored by zod schemas in
`packages/contracts/src/schemas.ts`. Data-file boundaries parse through them — `criteria.json` in
`criteriaData.ts`, pattern YAML in the engine loader — so malformed records fail loudly. The
hand-written interfaces stay canonical; the schemas mirror them, and compile-time drift guards
fail the build if the two diverge.

## Out of scope for v1 (do not implement)

Spec §16. CJK and Ethiopic reorder patterns, LDML output, mobile-app integration, hosting,
multi-language `welcome.htm` variants, `.kpj.user` management, touch-first authoring (Decision
6). The v1.1.0 amendment removed "editing existing keyboards" — single-source adaptation is now
in scope. Still out of scope: multi-source merge, survey-editing opaque IR fragments
(`RawKmnFragment`), and byte-identical round-trip.

The Three-group routing (§9) explicitly renders a "not yet supported" stub for CJK/Ethiopic — do
not silently empty the gallery.

## KM crew

A specialist pipeline coordinated by **`/km-lead`**. Agent definitions live in
`.claude/agents/km-*.md`; slash-command entry points in `.claude/commands/km-*.md`. **The full
roster — who does what, when to invoke each — is
[.claude/agents/km-README.md](.claude/agents/km-README.md).**

**Crew-file edits are gated by `pnpm crew-lint`.** Run it after touching any `.claude/**/km-*`
file.

### The one skill: `/km-lead`

`/km-lead` is the **only** KM crew member invoked as a Skill. It loads a team-lead playbook into
the **main session's** context; the main session then adopts the lead role, plans the work, and
spawns all other specialists as Agent subagents. It is not itself a subagent.

Use `/km-lead` when starting any coordinated team task. For brief one-off tasks where the main
session needs to temporarily act as a single specialist, you may invoke that individual skill —
but when running a team task through km-lead, **always use the other roles as Agent
`subagent_type`s, never as skills**.

km-lead writes a `dispatch_plan` YAML block before every cycle so the user can see what's about
to fire, then calls the Agent tool to execute it in the same response. Independent specialists in
the same cycle run in parallel.

### Branch policy

One feature branch per km-lead cycle. Convention: `km/<short-task-slug>`.

- Open the branch at cycle 1. State it in the dispatch_plan `branch:` field.
- All specialist commits during the cycle target that branch.
- `km-archivist` opens a PR against `main` at cycle close with `closes #N` or `refs #N` per the
  policy below.
- **Direct-to-main only when the user explicitly authorizes it** for that specific commit.

When in doubt, branch.

### Issue closure policy

When a cycle lands work that touches a tracked issue (`#N`), the closing specialist — usually
`km-archivist` at PR open, but also `/km-lead` for direct-to-main commits — must reconcile what
shipped against the issue's acceptance-criteria checkboxes:

1. **Enumerate the AC checkboxes.** `gh issue view N --json body` and walk the `- [ ]` list. If
   the issue has no checkboxes, this policy does not apply.
2. **Verify each one against the diff.** A checkbox is *done* only if the shipped change actually
   satisfies it — not if "we meant to" or "it's covered by another PR". Run the relevant command,
   read the relevant file, or call the relevant specialist (typically `km-verification`).
3. **Check the boxes that are done.** `gh issue edit N --body "<updated>"` with the verified boxes
   flipped. Leave a one-line note explaining which flipped and which didn't.
4. **Pick the right closing keyword.** All boxes checked → `closes #N`. Some still open →
   `refs #N`, and the issue stays open. Do not check boxes you haven't verified.

An issue with half its checkboxes flipped is more honest than one closed prematurely or one left
fully unchecked despite real progress. Partial closures are normal; **silent** partial closures
are the bug.

## Spec-kit (spec-driven feature loop)

[spec-kit](https://github.com/github/spec-kit) provides the **per-feature** generative loop that
sits *below* the monolithic [spec.md](spec.md). Installed in `.specify/` (templates, scripts,
`memory/constitution.md`) with skills under `.claude/skills/speckit-*`. The CLI version is pinned
in [scripts/spec-kit-version.json](scripts/spec-kit-version.json) — re-run `specify init --here`
only after deliberately bumping that pin.

**Workflow:** `/speckit-specify` (+ `/speckit-clarify`) → `/speckit-plan` (Constitution Check) →
`/speckit-tasks` → `/speckit-taskstoissues`, then `/km-lead` dispatches the crew against the
tasks. `/speckit-analyze` runs as a `km-doc`/`km-synthesis` review check before
`/speckit-implement`.

`.specify/memory/constitution.md` restates the locked gates so `/speckit-plan`'s Constitution
Check enforces them mechanically. It does **not** amend the spec — on conflict `spec.md` +
[docs/spec-signoff.md](docs/spec-signoff.md) win.

### Section extraction — don't shred the architecture

The monolithic `spec.md` is migrating into `specs/NNN-<slug>/` folders one numbered section at a
time, where `NNN` mirrors the spec.md section number (e.g. `specs/007-strategy-selection/` for
§7). **The extracted folder is authoritative for its section once landed; `spec.md` keeps a stub
pointer.** Sections not yet extracted remain authoritative in `spec.md`. Extracted so far: §7
(pilot), §8, §5 (Pattern schema).

Only *feature / contract* sections extract. The **architecture-core** sections — §4 (system
overview), §5a (KeyboardIR spine), §9 (routing), §10 (validator layering), §11 (criteria model),
§12/§13 (output + team boundaries) — describe how the whole tool composes; they are **not**
features and stay authoritative in `spec.md`, composed in
[docs/architecture.md](docs/architecture.md). (§8 Data flow was extracted before this rule; it is
the meta-flow and is treated as architecture-core wherever its text lives.) The reference-only
sections (§14, §17, §18, §19) are not planned for extraction.

When deciding whether to extract: *feature/contract → `specs/NNN`; architecture/meta-flow → stays,
composed in `docs/architecture.md`; reference → stays.*

**New features still get their own `specs/NNN-<slug>/`** with a creation-order `NNN`, and **cite
the governing `spec.md §X`** (or its extracted folder) rather than re-deriving scope. The
mirror-numbering convention applies only to sections being extracted; new features pick the next
free `NNN` above the extracted-section range.

**Drift split:** `utilities/spec-trace` owns textual drift of the spec corpus — the monolith's
sections, the extracted feature specs, and `docs/architecture.md`; it hashes each unit and flags
un-acknowledged changes (`node utilities/spec-trace check|report|acknowledge`).
`/speckit-analyze` owns per-feature `spec ↔ plan ↔ tasks` consistency. Do **not** install
spec-kit's "Spec Trace" community extension — it duplicates the existing utility.

## Conventions

- Windows environment: no emoji in console output (global CLAUDE.md rule). Use `[OK]`, `[ERROR]`,
  `[WARN]`.
- File references in user-facing text use markdown links (`[spec.md](spec.md)`), not backticks.
- Don't cite specific GitHub issue numbers inside shipped code or comments — cross-link via
  commit messages and PR bodies (spec §18).
- **Accessibility** (spec 056): studio UI code follows the house rules in
  [docs/accessibility.md](docs/accessibility.md) — semantic HTML first, keyboard-operable
  everything, programmatic labels, ARIA APG patterns for composite widgets, codepoint-derived
  accessible names for glyphs, aria-live riding existing cycles (D3). Conformance state lives in
  [specs/056-ada-accessibility/wcag-2.2-aa-tracker.md](specs/056-ada-accessibility/wcag-2.2-aa-tracker.md);
  a tracker row flips to `pass` only with named evidence.
- **i18n message ids** (spec 046): `area ( "." segment )+`, lowercase, dot-separated — e.g.
  `welcome.title`, `output.submit.button.submit`. An id is a permanent handle; renaming one
  orphans its translations, so only do it when the string's *meaning* changed, not its wording.
  Full authoring rules (JSX `<Trans>` vs. the `t` macro, variable interpolation, ICU plurals,
  what not to wrap) live in
  [specs/046-i18n-localization/contracts/catalog-format.md](specs/046-i18n-localization/contracts/catalog-format.md);
  rationale in [docs/i18n-spike.md](docs/i18n-spike.md).

## Commit and issue title style

Adopted from [keymanapp/keyman](https://github.com/keymanapp/keyman/issues). Format:
`<prefix>(<area>): <description>`.

**Prefixes**

- `bug` — issue titles only; a reported defect
- `fix` — PRs / commits that close a `bug`
- `feat` — new functionality (issues, PRs, commits)
- `docs` — documentation only
- `chore` — housekeeping with no behaviour change (deps bumps, formatting, build wiring)
- `maint` — internal cleanup that touches functional code but is not a feature or fix (renames,
  dead-code removal, shape-preserving cleanup)
- `refactor` — structural restructuring with no behaviour change
- `epic` — umbrella tracking issue (no area)
- `auto` — machine-generated (dep bumps, version bumps)

**Areas** (parenthesised after the prefix; pick the smallest that locates the change):
`contracts`, `tools`, `scaffolder`, `engine`, `studio`, `output`, `criteria`, `spec`, `process`,
`base-browser`, `deps`, `deps-dev`. Drop the area if the change spans more than one.

**Examples**

- `bug(scaffolder): scaffold() doesn't validate keyboardId per §10 Layer A check #1`
- `fix(scaffolder): validate keyboardId in scaffold() before VirtualFS write`
- `feat(tools): K_SYMBOLS placement algorithm + dry-run preview`
- `docs(spec): clarify §7.2 decision-tree firing order`
- `chore(deps): bump vitest 1.6 → 2.0`
- `maint(contracts): rename PatternQuestion.required → optional`

Keep `bug` and `fix` separate — `bug(...)` issues link to `fix(...)` PRs via `closes #N`. Mixing
the two blurs the issue/PR relationship.
