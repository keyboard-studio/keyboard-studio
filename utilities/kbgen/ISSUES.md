# kbgen integration — issue set

**Filed on keyboard-studio/keyboard-studio (2026-06-03).** Titles follow the repo convention
`<prefix>(<area>): <description>`. **#131** is the blocking gate — the contract type and
strategy scope must be settled in a joint session before the TS port or engine wiring conform.

Dependency order: **#130** (epic) tracks all · **#131** (gate) → **#132**, **#133** → **#134** · **#135** is post-v1.

| Filed | Was | Title | Labels |
|---|---|---|---|
| [#130](https://github.com/keyboard-studio/keyboard-studio/issues/130) | E1 | epic(kbgen): integrate the placement seeder into the engine pipeline | shared, integration, enhancement |
| [#131](https://github.com/keyboard-studio/keyboard-studio/issues/131) | #2 | process(kbgen): joint engine+content session to settle placement contract + scope | shared, process, blocker |
| [#132](https://github.com/keyboard-studio/keyboard-studio/issues/132) | #3 | chore(tools): port kbgen to ESM TypeScript and wire it into the workspace | engine, tooling, build |
| [#133](https://github.com/keyboard-studio/keyboard-studio/issues/133) | #4 | feat(contracts): add the placement-map type | engine, contracts, enhancement |
| [#134](https://github.com/keyboard-studio/keyboard-studio/issues/134) | #5 | feat(engine): consume kbgen output as Phase B placement defaults | engine, integration, enhancement |
| [#135](https://github.com/keyboard-studio/keyboard-studio/issues/135) | #6 | feat(tools): expand kbgen strategy coverage beyond S-01/S-08 | engine, tooling, enhancement |

The section bodies below were the drafting source; the filed issues match them. The
`file-issues.ps1` script in this folder is now spent (issues already exist) — keep it only as a
record.

---

---

## E1 — `epic(kbgen): integrate the placement seeder into the engine pipeline`
**Labels:** epic

Umbrella for promoting `utilities/kbgen` (logic-driven character-placement prototype) into a
contract-conforming engine deliverable: a *seeder* that proposes data-driven placements ahead
of the survey (spec §8 Phase B) for the user to confirm.

Background and conformance gaps: [utilities/kbgen/INTEGRATION.md](INTEGRATION.md).

Tracks: #2 (joint session, blocking), #3 (TS/ESM port), #4 (placement contract type),
#5 (engine wiring), #6 (strategy coverage, post-v1).

Done when: kbgen builds/tests under `pnpm -r`, emits a `packages/contracts` type, and the
survey can consume its output as Phase B defaults.

---

## #2 — `process(kbgen): joint engine+content session to settle placement contract + scope`
**Labels:** process
**Blocks:** #3, #4, #5

Per CLAUDE.md and spec §13, anything touching `packages/contracts` or the strategy scope is a
Day-1-style joint decision, not a solo edit. Resolve before any port/wiring conforms to it:

- [ ] **Placement type.** Map kbgen's ad-hoc `placement-map.json` to a formal type — extend the
      `Pattern` schema (§5) or add a sibling `PlacementMap` type in `packages/contracts`. Decide
      which. (Schema change → major-version bump of `packages/contracts`.)
- [ ] **Strategy scope.** kbgen currently emits only S-01/S-08 (§7.3). Confirm the seeder stays
      scoped to substitution-class strategies for v1 (Milestone 1: Latin-extended on QWERTY), or
      define which other strategies (S-02/S-05/S-07/S-09) it should grow to seed (→ #6).
- [ ] **Ownership of the anchor heuristics.** `data/supplement.json` (curated look-alikes +
      phonetic hints) overlaps content-team's pattern-library curation vs engine's placement
      logic. Assign an owner (§13 boundary).

Output: a short decision note appended to INTEGRATION.md; unblocks #3/#4/#5.

---

## #3 — `chore(tools): port kbgen to ESM TypeScript and wire it into the workspace`
**Labels:** chore, tools
**Blocked by:** #2 (for the emitted type only — toolchain port can start in parallel)

- [ ] CommonJS → ESM TypeScript (mirror `packages/engine` shape).
- [ ] Add `tsconfig.json`, `build` / `typecheck` scripts; migrate
      `node test/anchors.test.js` → vitest.
- [ ] Decide final home: stays in `utilities/` as a built tool, or returns to `packages/*`
      once it conforms. If it returns, it re-enters the `packages/*` pnpm glob — confirm it
      passes `pnpm -r build` / `typecheck` / `test`.
- [ ] Keep the no-compile boundary (§13): kbgen emits source only; compilation stays with the
      WASM `kmcmplib` service.

---

## #4 — `feat(contracts): add the placement-map type settled in #2`
**Labels:** feat, contracts
**Blocked by:** #2

Implement the placement type decided in #2 (extend `Pattern` or add `PlacementMap`) in
`packages/contracts/src/`, with fixtures + vitest specs matching the existing contract style.
If it's a `Pattern` schema change, bump `packages/contracts` major per the revision policy
(CLAUDE.md / §17).

---

## #5 — `feat(engine): consume kbgen output as Phase B placement defaults`
**Labels:** feat, engine
**Blocked by:** #3, #4

Wire the seeder into the survey flow (spec §8 Phase B / §7.2): run kbgen to propose
data-driven placements, surface them as pre-filled defaults the user confirms or overrides,
tagged with the relevant `strategyId`. Emission still flows through the existing
scaffolder/compiler path — kbgen does not compile.

---

## #6 — `feat(tools): expand kbgen strategy coverage beyond S-01/S-08`  *(post-v1 / scope-gated by #2)*
**Labels:** feat, tools
**Depends on:** #2 scope decision

Today the anchor cascade only produces substitution (S-01) + RALT-layer (S-08) placements.
If #2 decides the seeder should cover more of the §7.2 decision tree, add emitters for the
agreed strategies (candidates: S-02 deadkeys, S-05 mnemonic spelling, S-07 cycling,
S-09 clusters). Out of scope unless #2 says otherwise.
