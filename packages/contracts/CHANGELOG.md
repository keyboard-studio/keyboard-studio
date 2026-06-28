# Changelog — `@keyboard-studio/contracts`

All notable changes to the `@keyboard-studio/contracts` package are documented
here. The package follows [0ver](https://0ver.org/) semantics while pre-1.0: a
breaking change bumps the **minor** version.

## [0.12.0] — 2026-06-28

### Contract change (spec §3.6 "MAJOR" tier — 0ver minor bump)

- `TouchKeyIR` (`keyboard-ir.ts`) gains an **optional, additive**
  `provenance?: TouchKeyProvenance` field, where
  `type TouchKeyProvenance = "base-derived" | "physical-suggested" | "hand-set"`.
  An absent or pre-existing-untagged key is treated as `"hand-set"` and is never
  auto-clobbered by re-propagation; `"base-derived"` / `"physical-suggested"`
  are the auto-managed states. `TouchKeyProvenance` is exported from the package
  entry (`index.ts`, via `keyboard-ir.ts`), and
  `editors/assignLoop/provenance.ts` now **re-exports** this type so there is a
  single source of truth (spec-014 FR-008, provenance.contract.md P1/SC-007).
- zod mirror: `TouchKeyProvenanceSchema = z.enum([...])` added in `schemas.ts`
  with a compile-time drift guard (`_TouchKeyProvenanceGuard`), keeping the
  type↔schema lockstep (Art. I drift guard, provenance.contract.md P4). Distinct
  from the import-attribution `ProvenanceEntrySchema` (different concept).
- `QuestionModule.mutate?` (studio survey layer) — the executable write seam is
  **ratified at the type level**:
  `mutate?(value, ctx: MutateContext): Partial<KeyboardIR>`, a pure function
  returning a patch the reducer applies as a path-scoped DEEP merge restricted to
  the module's declared `writes` `IRPath`s (writing outside them is a fail-fast
  whole-patch rejection; idempotent on re-apply). The reducer apply path, the
  per-module `mutate` implementations, and touch re-propagation remain GATED P5
  front-end work (task T014) — this change is the contract surface only.

**Versioning rationale.** spec-014 §3.6 / FR-011 classifies this locked-surface
`TouchKeyIR` edit as a **MAJOR** contract change requiring a §18 joint session.
The field itself is technically optional/additive (non-breaking). Under this
package's 0ver discipline (CHANGELOG header: "a breaking change bumps the
**minor** version"), both tiers map to a **minor** version bump pre-1.0 — see the
prior precedents: the #232 KeyboardIR lock landed as **0.3.0** ("additive minor,
pre-1.0 conventions per §18", spec-signoff 2026-06-09) and the breaking `IRPath`
change landed as **0.11.0** ("rather than 1.0.0"). Accordingly this §18-ratified
contract addition is **0.12.0** — a minor bump, recorded as a §18 ratification so
no consumer absorbs it as a silent patch.

This was ratified during a weekend no-commit window by Matthew Lee (contract
authority); see `docs/spec-signoff.md` (§18 note, 2026-06-28). Lineage: spec-014
and the closed #232 (schema lock).

## [0.11.0] — 2026-06-26

### Breaking

- Added the `IRPath` typed key-path algebra (`ir-path.ts`) — a structural path
  type derived from `KeyboardIR`, plus the `irPath(...)` builder and
  `formatIRPath(path)` stringifier. An invalid path is a compile error (Design
  AC); a renamed or removed `KeyboardIR` field invalidates any path naming it
  and fails typecheck (Drift AC). Traversal is bounded at touch `keys[]` and
  treats `RawKmnFragment` as a terminal (opaque fragments are not addressable
  below the list).
- `QuestionModule` (consumed via the studio survey layer) gains
  `inputs?: readonly IRPath[]` and `writes?: readonly IRPath[]`, both over the
  same `IRPath` address space.

This is the §18 breaking change ratified at the 2026-06-26 joint engine+content
session. The version was confirmed as **0.11.0** (0ver) rather than 1.0.0.
