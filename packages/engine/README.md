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
