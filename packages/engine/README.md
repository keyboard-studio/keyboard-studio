# @keyboard-studio/engine

Engine services for keyboard-studio. Currently houses the validator's TS-portable
checks (spec §10 Layer A, checks #1–#4 today) and the `kmcmplib` WASM oracle
wrapper landed in Issue #16.

## What lives here

- `src/validator/checks/` — TS-portable Layer A checks. Each check is a pure
  function `(source: string) => LintFinding[]`. Currently: identifier
  validation, duplicate groups, duplicate stores, deprecated stores
  (#1–#4). Checks #5–#9 land under their own issues.
- `src/validator/oracle.ts` — `validateWithOracle()`, the public API.
  Composes the TS-portable checks with the WASM oracle and returns a
  unified `LintFinding[]`. Lazy-loads the WASM binary; degrades to TS-only
  on load failure.
- `src/validator/wasmLoader.ts` — the acquisition seam.
  `WasmOracleHandle` interface plus the `loadWasmOracle()` factory.
  Production builds will load the WASM bundled in
  [`@keymanapp/kmc-kmn`](https://www.npmjs.com/package/@keymanapp/kmc-kmn).
- `src/validator/codeMap.ts` — `kmcmplib` code → studio `LintCode` translation.
  Named aliases for checks #10–#14; unmapped codes fall through to the
  `passthrough` group with severity preserved from the upstream prefix.
- `src/validator/OracleLoadError.ts` — typed error thrown by the loader on
  WASM fetch / instantiate / ABI failures. Never re-thrown to callers of
  `validateWithOracle()`.

## Simulator

`src/simulator/index.ts` exposes two functions exported from the
`@keyboard-studio/engine/simulator` subpath (Node-only — kept off the main
entry so the browser bundle never follows the vendored Keyman engine):

- `simulate(compiled, keys)` — feeds a `SimKeyInput[]` sequence through the compiled Keyman `.js`
  artifact via a vendored JS-processor in a Node `vm` sandbox and returns a `SimulationResult`
  (full text output plus a per-step trace).
- `runPatternTests(pattern, compiled)` — runs every `TestVector` in `pattern.tests` through
  `simulate()` and returns a `PatternTestResult` (pass/fail per vector).

### Contract boundary

`simulate()` is the authoritative, deterministic path for:

- vitest specs and CI cross-validation (it is synchronous and runtime-free from the test's perspective)
- `Pattern.tests` round-trip vectors (spec §5)
- doc-gallery and transcript rendering where a reproducible output is required

**`simulate()` is Node-only.** It relies on `node:vm`; it cannot be called from the browser SPA.

**The KeymanWeb iframe** (`packages/studio/public/osk-frame.html`, `OSKFrame.tsx`) is the separate,
live-preview path for interactive, user-facing keyboard tryout. It is unaffected by this API.

**Higher-fidelity `.kmx` round-trip** via Keyman Core is a distinct, future path tracked separately —
`simulate()` operates on the compiled `.js` artifact only.

Contract types (`SimKeyInput`, `DeadkeySnapshot`, `SimulationStep`, `SimulationResult`,
`TestVectorResult`, `PatternTestResult`) live in
[`packages/contracts/src/simulation.ts`](../contracts/src/simulation.ts) and are re-exported from
`@keyboard-studio/contracts`.

### Quick usage (Node / vitest)

```ts
import { simulate, runPatternTests } from "@keyboard-studio/engine/simulator";
import type { SimKeyInput } from "@keyboard-studio/contracts";

// Compile first (see "Compiler service" below), then:
const keys: SimKeyInput[] = [
  { vkey: "K_QUOTE", modifiers: [], caps: false },
  { vkey: "K_A",     modifiers: [], caps: false },
];
const result = simulate(compiled, keys);
// result.finalOutput === "á"
// result.trace[0].pendingDeadkeys  → [{id: 0, position: 0}]
// result.trace[1].pendingDeadkeys  → []

// Or run all Pattern.tests in one call:
const testResult = runPatternTests(pattern, compiled);
// testResult.allPass, testResult.vectors[n].pass / .actualOutput
```

## Quick start

```ts
import { validateWithOracle } from "@keyboard-studio/engine";

// Default: run every group (lexical, reference, behavior, passthrough).
const findings = await validateWithOracle(kmnSource);

// Restricted: run only the TS-portable lexical checks. Returns fast and
// does not touch the WASM oracle, so it never appends
// KM_WARN_ORACLE_UNAVAILABLE even when WASM is down.
const lexicalOnly = await validateWithOracle(kmnSource, {
  groups: ["lexical"],
});
```

When the WASM oracle fails to load, `validateWithOracle()` still returns the
TS-portable findings and appends a single `KM_WARN_ORACLE_UNAVAILABLE`
warning to the result. It never throws `OracleLoadError` to the caller.

## Check groups

Layer A checks are partitioned into four groups; consumers pass any subset
via `LintOptions.groups`. See `src/validator/types.ts` for the canonical
list.

| Group | Checks (spec §10) | Severity | Where it runs |
|---|---|---|---|
| `lexical` | #1, #4, #7 | error/warn | TS-only |
| `reference` | #2, #3, #5, #6, #8, #9, #13, #14 | error | mixed (TS + WASM) |
| `behavior` | #10, #11, #12 | hint/warn/error | WASM-only |
| `passthrough` | unmapped `KMCMP_*` | varies | WASM-only |

## Refreshing the bundled WASM blob

**Default path (Option A — npm dependency):** the production loader
consumes the WASM artifact bundled inside `@keymanapp/kmc-kmn`. When
`kmcmplib` ships new diagnostic codes or fixes, refresh by:

```
pnpm --filter @keyboard-studio/engine update @keymanapp/kmc-kmn
pnpm --filter @keyboard-studio/engine test
```

If new `kmcmplib` codes should be exposed under a stable studio alias
rather than passing through, add an entry to `src/validator/codeMap.ts`
under a `chore(engine)` PR and bump the engine package's patch version.

**Escape hatch (Option B — vendored loader):** consumers that need to
load a different `kmcmplib` build (e.g. local development against a
newer `kmcmplib`, or a vendored copy when `@keymanapp/kmc-kmn` lags)
can build their own loader against the `WasmOracleHandle` interface and
pass it to `_createOracle()`:

```ts
import { _createOracle, type WasmOracleHandle } from "@keyboard-studio/engine";

const myHandle: WasmOracleHandle = {
  async lintWasmGroups(source, groups) {
    // wire to your own WASM build...
    return [];
  },
  dispose() {},
};

const myOracle = _createOracle(myHandle);
const findings = await myOracle.lint(kmnSource);
```

The `WasmOracleHandle` interface (`src/validator/wasmLoader.ts`) is the
stable seam — consumers never see the raw `kmcmplib` ABI directly.

## Build and test

```
pnpm --filter @keyboard-studio/engine build
pnpm --filter @keyboard-studio/engine typecheck
pnpm --filter @keyboard-studio/engine test
```
