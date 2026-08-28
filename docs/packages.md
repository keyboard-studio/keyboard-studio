# Package inventory

What exists under `packages/*` and what each package owns. [CLAUDE.md](../CLAUDE.md) carries the
one-line summary; [docs/architecture.md](architecture.md) carries how they compose;
[docs/tooling.md](tooling.md) carries how to build and test them.

**Day-1 contract is locked and the engine + studio are now built out.** This supersedes the
earlier "contracts only" status.

## Workspace packages

### `@keyboard-studio/contracts`

The locked Day-1 shared contract: TS types, the seven service interfaces + mocks, fixtures, the
criteria catalog at `packages/contracts/data/criteria.json`, and the runtime **zod schemas**
(`src/schemas.ts`) that mirror the locked `Pattern`/`Criterion` types. The dependency root —
everything else builds to it.

The criteria catalog currently holds 149 rows (133 repo-hygiene + 12 §18 DISCUS design-heuristic
at Day-1 lock, plus post-lock adjustments). That is a **descriptive count, not a locked
constant** — see spec §11 and
[docs/discus-principles-integration.md](discus-principles-integration.md).

### `@keyboard-studio/engine`

The real engine. Subsystems under `packages/engine/src/`: `codec` (.kmn ↔ KeyboardIR),
`scaffolder`, `output` (VirtualFS → zip **and** → installable `.kmp`), `validator`, `compiler`
(kmcmplib wrapper), `simulator`, `recognizer` (+ generated rules), `pattern-apply`,
`pattern-library`, `strategy-selector`, `character-discovery`, `inventory`, `loader`,
`base-browser`, `stub-mutator`, `langtags` (SIL langtags slim-index lookup; exposed as
`@keyboard-studio/engine/langtags`).

### `@keymanapp/keyboard-lint`

Layer C hygiene lint engine (`lintEngine.ts`, `checks/`, `parsers/`).

### `@keyboard-studio/llm`

Pluggable LLM client (`backends/`) for prompt-driven assistance.

### `@keyboard-studio/glottolog`

Offline, pinned copy of Glottolog's language-classification tree (checked-in generated index
derived from `glottolog-cldf` via `fetch-glottolog`/`codegen-glottolog`) plus the relatedness
catalog and the keyboard-base bridge (`./bridge`) that turns "language X has no keyboard" into
ranked bases from close relatives. Contracts-only edge (the bridge takes injected deps; no
engine/studio import). See [specs/036-glottolog-catalog/](../specs/036-glottolog-catalog/).

### `@keyboard-studio/studio`

The React + Vite SPA (three-pane gallery / editor / preview; working-copy spine).

## Not yet realised as written

Spec targets that do **not** match the tree — check a package's actual exports before
referencing it:

- The `@keymanapp/kmn-validator` package has not been extracted. Layer A/B (and Layer A'
  import-fidelity) validation lives in `engine/src/validator`. See
  [docs/architecture.md](architecture.md).

## Not a package

`utilities/*` is deliberately outside `packages/*` so it doesn't trip `pnpm -r` — including the
kbgen placement-seeder prototype. Inventory and run instructions are in
[docs/tooling.md](tooling.md#standalone-utilities).

## Delivery-option progress

Progress lives in [docs/github_flow.md](github_flow.md) — Status section. **Whenever work lands
that advances Option A (user-fork/app-managed PR), Option B (org-mediated PR), or Option C (ZIP
download), update that table and the progress bar before closing the issue or merging the PR.**
The scaffolder and VirtualFS serialisation rows in the prerequisites table also need updating as
those land.
