# Iteration 01 — Build / tooling configs (PARTIAL — context7 blocked)

**Files reviewed:** `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/vitest.config.ts`
**Libraries/specs consulted:** spec.md §13 (Team boundaries — partial read), §17 (Glossary), §18 (Revision policy). **Context7 calls attempted: 2 / both failed — "Monthly quota exceeded".**
**Date:** 2026-06-02

## Summary

The build/tooling layer is internally coherent and matches what spec.md implies (pnpm monorepo with `packages/contracts` as the shared types package). Findings below are based on direct code inspection and spec cross-check only — the "is this still current best practice for TS 5.4+ / Vitest 2.x / pnpm 9?" half of the audit could not be performed because Context7 returned monthly-quota-exceeded on the first call. **This iteration is incomplete.** See STATUS.md Blockers section.

## Findings (from direct inspection only)

### [INFO] Root package.json declares pnpm 9.12.0 and Node >=20
- **File:line:** `package.json:6-9`
- **Evidence:** `"packageManager": "pnpm@9.12.0"`, `"engines": { "node": ">=20" }`
- **Spec ref:** spec.md does not pin a specific pnpm/Node version in the sections I read — this is an engine-team choice that needs to be socialized in Day-1.
- **Note:** Verification that pnpm 9.12.0 is still the latest stable in the 9.x line, and that no breaking change has landed between 9.12 and current, requires Context7.

### [MINOR] Root vitest.config.ts and packages/contracts/vitest.config.ts duplicate the same `passWithNoTests: true` setting
- **File:line:** `vitest.config.ts:1-7` and `packages/contracts/vitest.config.ts:1-9`
- **Issue:** Two configs, slight overlap. The package-level config additionally constrains `include: ["src/**/*.test.ts"]`.
- **Recommendation:** Either drop the root config (vitest finds package configs via workspace), or convert to a vitest workspace file (`vitest.workspace.ts`) so the root co-ordinates per-package configs cleanly. Verification of "what's the recommended pattern in vitest 2.x for pnpm monorepos" needs Context7.

### [MINOR] tsconfig.base.json sets `verbatimModuleSyntax: false` explicitly
- **File:line:** `tsconfig.base.json:24`
- **Issue:** Setting this `false` is the TS default, so the explicit declaration is either signal of intent ("we considered it and chose off") or carryover noise. With `isolatedModules: true` already on (line 18), turning `verbatimModuleSyntax` on would be the stricter / forward-looking choice and is what TS 5.4+ docs generally recommend for new code.
- **Recommendation:** Either delete the line (default) or flip to `true` and audit imports. Decide explicitly before more packages copy this base. Context7 confirmation pending.

### [INFO] Strict TS flags are well-chosen for a contracts package
- **File:line:** `tsconfig.base.json:8-13`
- **Evidence:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns` all on.
- **Verdict:** [OK]. These are exactly what you want for a shared-types package. `exactOptionalPropertyTypes` is the only one that bites — it will require contracts authors to be deliberate about `key?: T` vs `key: T | undefined`. Worth a note in `packages/contracts/README.md` (verify in iteration 06 or 09).

### [INFO] Project references are wired (composite + declaration + tsBuildInfoFile)
- **File:line:** `packages/contracts/tsconfig.json:6-7`, base `declaration: true, declarationMap: true, isolatedModules: true`
- **Verdict:** [OK]. Setup is correct for `tsc -b` incremental builds across a monorepo. When the engine package lands, it will need a root `tsconfig.json` with `"references": [{"path": "packages/contracts"}, ...]` — that file does not exist yet (no root tsconfig.json beyond `tsconfig.base.json`). Flag this as a gap when the second package lands.

### [GAP] No `tsconfig.json` at repo root — only `tsconfig.base.json`
- **File:line:** repo root
- **Issue:** With composite projects, the canonical pattern is `tsconfig.base.json` for shared compilerOptions + a root `tsconfig.json` that lists `references` to every package. Today there's no root `tsconfig.json`, so `tsc -b` from root would do nothing — `pnpm -r build` works because each package handles itself, but a single-command type-check across the monorepo doesn't exist. Root script `"typecheck": "pnpm -r typecheck"` works around this.
- **Recommendation:** When the second package lands, add `tsconfig.json` at root with `references` and `"files": []`. Not urgent at one package.

### [MINOR] `exports` in contracts package.json is missing a wildcard / subpath
- **File:line:** `packages/contracts/package.json:9-14`
- **Issue:** Only the root export `.` is mapped. Consumers cannot import e.g. `@keyboard-studio/contracts/pattern` directly. spec.md §17 talks about `StrategyId` being exported from `@keyboard-studio/contracts` — single root export is fine for that. But the `.cts/.mts/.d.ts` distinction is collapsed to one mapping that assumes ESM-only consumers. The package declares `"type": "module"` (line 5), so CJS consumers (some Node tooling, e.g. older eslint configs) get no fallback.
- **Recommendation:** Either declare ESM-only explicitly in README, or add a `require` condition emitting CJS. Verification of which Node CJS-consumer fallback pattern is now recommended needs Context7.

### [QUESTION] `"main"` and `"types"` fields exist alongside `exports` — which wins?
- **File:line:** `packages/contracts/package.json:7-14`
- **Issue:** When both `main` and `exports` are present, Node 12+ uses `exports` and ignores `main`. The `main`/`types` here are redundant but not wrong; some legacy bundlers still read them. Keep or delete is a style call.
- **Recommendation:** Leave both for now — harmless. Worth one-line comment in package.json or a note in contracts README explaining policy.

### [INFO] Vitest `include: ["src/**/*.test.ts"]` matches tsconfig `exclude: ["**/*.test.ts"]`
- **File:line:** `packages/contracts/tsconfig.json:10`, `packages/contracts/vitest.config.ts:5`
- **Verdict:** [OK]. Tests are colocated with sources but excluded from the published build — correct pattern.

## What was NOT verified (context7-dependent)

The following questions require current docs and could not be answered this iteration:

1. Is `moduleResolution: "Bundler"` still the recommended choice for TS 5.4+ when there is no actual bundler (this is a pure tsc -b setup)? `NodeNext` would be the alternative.
2. Has Vitest 2.x deprecated `defineConfig` from `vitest/config` in favor of anything new? (Project workspaces, defineWorkspace, etc.)
3. Is `@typescript-eslint` 7.x still the supported line, or has 8.x landed with a breaking change that affects this repo? The lockfile shows 7.18.0 — needs version-currency check.
4. Is ESLint 8.57 still supported, or should this jump to ESLint 9 with the flat-config? Flat config migration is a known TS-ESLint topic.
5. Is `prettier@^3.3.3` still current and any 3.x→3.x breaking changes since? (Probably not, but verifying is the loop's job.)
6. Is pnpm 9.12.0 still the latest 9.x? Any 9→10 migration on the horizon?

## Cross-iteration TODOs surfaced

- Iteration 06: contracts README should call out `exactOptionalPropertyTypes` semantics for consumers.
- Iteration 09: revisit the docs-vs-code question: does spec §13 (team boundaries) describe the build layout this repo has?
- New iteration (post-blocker): when context7 is available again, re-run the six version-currency questions above.

## Verdict

[WARN] — Internally consistent, but unverified against current library docs. The audit half that needs context7 was blocked on the first call. Loop stopped per STATUS.md rule.
