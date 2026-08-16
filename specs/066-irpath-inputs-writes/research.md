# Phase 0 Research: IRPath + declared `inputs`/`writes`

All NEEDS CLARIFICATION items from Technical Context resolved below. Each entry:
**Decision / Rationale / Alternatives considered.**

## R1 — `IRPath` realization mechanism

**Decision**: Realize `IRPath` as a **derived typed key-path** over `KeyboardIR`
— a readonly tuple of path segments (object keys and the array-index sentinel),
computed by recursive conditional types over the *actual* `keyboard-ir.ts`
interface tree. A small runtime helper (`irPath(...)` builder + `formatIRPath()`
stringifier) provides ergonomic construction and a stable display string for the
dashboard. The canonical form is the tuple; the string form is for presentation
only.

**Rationale**:
- **Design AC (invalid path = compile error)** falls out for free: a tuple that
  is not a valid path through the type simply does not satisfy `IRPath`, so the
  module fails `tsc`. No runtime validation needed.
- **Drift AC (path absent from `keyboard-ir.ts` fails typecheck)** is automatic:
  `IRPath` is *derived from* `KeyboardIR`, so renaming/removing a field
  immediately makes any tuple naming it non-assignable — a stale `writes` breaks
  the build with no codegen step to forget to re-run.
- **No new build step.** The repo already has two prebuild codegen steps
  (`fetch-kmcmplib`, `compile-recognizer-rules`); avoiding a third keeps the
  clean-checkout contract simpler. A purely type-level derivation needs none.
- The tuple form is trivially serializable (`formatIRPath` → e.g.
  `groups[].rules[].output`) so the P0 dashboard can render it (FR-012).

**Alternatives considered**:
- **Template-literal path-string type** (e.g. `"groups[].rules[].output"`):
  most readable in source, but template-literal types over a deeply nested,
  recursive union (`TouchKeyIR` self-recurses via `sk`/`flick`/`multitap`) are
  hard to make sound and hit TS recursion limits; "invalid path = compile error"
  becomes leaky. Rejected as the canonical form (kept as the *display* form via
  `formatIRPath`).
- **Generated lens set** (codegen branded path constants from the IR AST):
  fully sound and drift-proof, but adds a third prebuild codegen step and a
  generated-artifact maintenance burden. **Kept as the fallback** if the
  recursive conditional type proves too costly for `tsc` (see R3).

## R2 — Enforcing the two compile-time ACs

**Decision**: Both ACs are **type-level**, asserted by dedicated type tests in
`ir-path.test.ts` using `// @ts-expect-error` for the negative cases and
assignability checks for the positive cases. The CI typecheck (`pnpm typecheck`)
is the enforcement gate; a regression that makes an invalid path *compile* fails
the `@ts-expect-error` assertion (TS reports the unused expectation).

**Rationale**: Matches the existing contracts pattern where `schemas.ts` drift
guards are compile-time. Keeps the ACs honest in CI without runtime machinery.

**Alternatives considered**: Runtime path validation against a parsed IR shape —
rejected: weaker (runtime miss, not compile error) and contradicts the spec's
"compile error, not a runtime miss".

## R3 — Touch recursion depth (`TouchKeyIR`)

**Decision**: Bound `IRPath` at the **`touchLayout.platforms[].layers[].rows[].keys[]`**
level — exactly the depth the plan §3.3 names. Do **not** recurse `IRPath` into
`TouchKeyIR.sk` / `flick` / `multitap` (the self-recursive sub-key structures)
for P2. Sub-key-granular paths are out of scope for P2 declarations and reserved
for the mutate seam (P5).

**Rationale**: `TouchKeyIR` is self-recursive with unbounded depth; deriving an
unbounded path type risks `tsc` recursion-limit errors and slow typechecks.
P2's declared `writes` need location granularity at the key level, not inside a
longpress popup. Bounding here keeps the conditional type tractable and matches
the stated acceptance path. If a later phase needs sub-key paths, extend the
derivation then (the type is the single point of change).

**Alternatives considered**: Full recursion into sub-keys — rejected for P2
(cost + no requirement). If even the bounded derivation is too costly, fall back
to the R1 generated-lens approach with a fixed enumerated depth.

## R4 — Does `IRPath` need a zod mirror in `schemas.ts`?

**Decision**: **No runtime zod mirror for the `IRPath` type itself** in P2.
`IRPath` is a compile-time path algebra, not a data record parsed at a file
boundary, so the `schemas.ts` "mirror + drift-guard" pattern (which exists to
validate `criteria.json` / pattern YAML at I/O boundaries) does not apply.
`inputs`/`writes` are authored in TypeScript modules, not loaded from YAML, so
they are checked by `tsc`, not by zod at a boundary. Revisit only if/when
`inputs`/`writes` ever get expressed in the thin `*.modular.yaml` manifests
(they are not, in P2).

**Rationale**: Avoids inventing a runtime schema for a type that never crosses a
parse boundary. Keeps the contracts drift-guard surface focused on what it
guards today.

**Alternatives considered**: Add `IRPathSchema` for symmetry — rejected as
unnecessary surface area with no I/O boundary to defend.

## R5 — Version bump for `@keyboard-studio/contracts` (pre-1.0 nuance)

**Decision**: The §18 session ratified a **"MAJOR version bump."** The package is
at **0.10.0** (pre-1.0). Under semver's 0.x convention a breaking change bumps
the **minor** (0.10.0 → **0.11.0**), which *is* the "breaking/major" bump for a
0.x line. **Recommend 0.11.0** as the breaking release, recorded as the major
contract change the §18 session intended. Surface the alternative (graduate to
**1.0.0**) to the user as a release-management call — it does not change the
engineering work, only the version string.

**Rationale**: Honors the ratified "this is a breaking bump, not a freely-absorbable
minor addition" intent while staying consistent with how a 0.x package signals
breakage. The choice between 0.11.0 and 1.0.0 is a release decision, not a design
blocker, so it should not stall the plan.

**Alternatives considered**: Treat as additive-minor (0.10.0 → 0.10.x) —
**rejected**, contradicts the §18 ratification and Constitution Article I/VI. Jump
straight to 1.0.0 — viable; deferred to the user as a release call.

**[NEEDS USER DECISION at release time]**: 0.11.0 (recommended) vs 1.0.0. Not a
plan blocker.

## R6 — Home for the new CI checks

**Decision**:
- **Orphan-input lint (FR-007)** and **coverage check (FR-006)** operate over the
  studio registry + flow manifests, so they live as **vitest specs in
  `packages/studio`** (manifest-scoped; reuse `loadModularFlow`/registry to know
  which questions a manifest references). They are ordinary `pnpm -r test` gates,
  not new tooling.
- **Missing-mirrored-test check (FR-009)** is a **directory-diff assertion** (a
  single vitest spec) that maps each `src/survey/questions/<phase>/<id>` to its
  expected `tests/survey/questions/<phase>/<id>.test.ts`, mirroring the P0
  module→map-node snapshot shape (§7.2/§7.3).
- **Write-surface test (FR-008)** is a vitest spec in `packages/studio` that
  cross-checks declared `writes` against the §7.7 assignment-map write surface,
  **conditional** on the available surface (clarification Q3).

**Rationale**: Keeps everything inside the existing per-package vitest gates;
no new CI infrastructure. Matches the plan's "single directory-diff CI check"
framing for test coverage.

**Alternatives considered**: A standalone `utilities/` checker — rejected:
heavier, and these checks need the studio registry/manifest types anyway.

## R7 — Discovering which modules need folder form

**Decision**: Treat folder-per-question conversion as a **discovery task in
Phase 2 (tasks)**: enumerate modules that reference companion artifacts (inline
sample text blocks, images, or a custom render component) and convert only those
to `<id>/index.ts` + `extras/`. The flat `<id>.ts` form stays the default for
everything else. Registry resolution by `definition.id` is invariant across both
forms, so conversion is mechanical and per-module independent.

**Rationale**: The exact set is small ("a handful," per the plan) and is a
mechanical layout move with no contract impact; pinning the list belongs in
`/speckit-tasks` against the live tree, not in the plan.

**Alternatives considered**: Convert all modules to folder form for uniformity —
rejected: violates "flat by default," churns 93 modules and their imports for no
benefit.

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| `IRPath` mechanism | Derived typed key-path (tuple) over `KeyboardIR`; no codegen; lens-set fallback |
| Compile-error + drift enforcement | Type-level tests + `pnpm typecheck` gate |
| Touch recursion | Bounded at `…rows[].keys[]`; no sub-key recursion in P2 |
| zod mirror | Not needed (no I/O boundary for `IRPath`) |
| Version bump | 0.11.0 recommended (pre-1.0 breaking); 1.0.0 a user release call |
| CI-check home | vitest specs in `packages/studio`; contracts type tests in `packages/contracts` |
| Folder-form set | Discovered in `/speckit-tasks` against the live tree |
