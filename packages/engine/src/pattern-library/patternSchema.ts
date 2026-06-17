// The canonical YAML-tolerant pattern input schema now lives in
// @keyboard-studio/contracts (schemas.ts) — the contract root owns the single
// definition, kept in lock-step with the Pattern type by compile-time drift
// guards. This module re-exports it under the historical `PatternSchema` name
// so the `@keyboard-studio/engine/pattern-schema` subpath — consumed by the
// loader and by the studio's browser pattern library — keeps resolving
// unchanged.
//
// Why "raw": authored YAML uses numeric ids/dates, raw category directory
// names, explicit `null` for absent fragments, and extra content-only keys.
// The loader's toPattern() normalises a parsed RawPattern into a strict
// contract Pattern. See contracts schemas.ts for the strict PatternSchema.

export { RawPatternSchema as PatternSchema } from "@keyboard-studio/contracts";
export type { RawPattern } from "@keyboard-studio/contracts";
