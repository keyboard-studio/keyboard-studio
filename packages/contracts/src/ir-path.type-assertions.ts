/**
 * Compile-time type-level assertions for IRPath (Design AC / G1, Drift AC / G2).
 *
 * This file is compile-time ONLY — it has no runtime exports and produces no
 * JS output that matters. It exists so that the type-level invariants are
 * compiled by `tsc --noEmit` (i.e. `pnpm typecheck`) rather than merely
 * transpiled by vitest, which does NOT run tsc.
 *
 * Why a separate file instead of including *.test.ts in the typecheck tsconfig:
 *   The contracts test files import `vitest` (describe/it/expect) which would
 *   require explicit `types: ["vitest/globals"]` wiring and would surface
 *   pre-existing type issues in ~16 other test files — all out of scope. A
 *   dedicated non-test file compiles under the existing tsconfig with zero
 *   collateral impact (lower-risk mechanism, option (a)).
 *
 * HOW THE GUARD WORKS
 * -------------------
 * Positive assertions: `IsTrue<AssignableTo<SomePath, IRPath>>` must compile.
 *   If the path stops being valid (e.g. a KeyboardIR field is renamed), the
 *   `AssignableTo` resolves to `false`, `IsTrue<false>` errors, and typecheck
 *   fails → Drift AC (G2) fires.
 *
 * Negative assertions: `@ts-expect-error` over an invalid path assignment.
 *   If someone accidentally makes the invalid path valid, TS reports an
 *   "unnecessary @ts-expect-error" → typecheck fails → Design AC (G1) fires.
 *   Conversely, removing the @ts-expect-error over a genuinely-invalid path
 *   causes a type error → typecheck fails → G1 fires.
 *
 * MAINTENANCE
 * -----------
 * Add new assertions here when new IR fields are introduced or new
 * out-of-scope paths need to be guarded (e.g. additional RawKmnFragment
 * sub-field rejections). Do NOT add runtime code — this file is not a module
 * that other files should import.
 */

import type { IRPath, AssignableTo } from "./ir-path.js";
import { ARRAY_INDEX } from "./ir-path.js";

// ---------------------------------------------------------------------------
// Helper: static type assertion (compile-time only)
// ---------------------------------------------------------------------------

/** Asserts at compile time that T is exactly `true`. */
type IsTrue<T extends true> = T;

// ---------------------------------------------------------------------------
// POSITIVE assertions — valid paths must be assignable to IRPath
// ---------------------------------------------------------------------------

// Physical surface: canonical path named explicitly in the spec
type _Assert_PhysicalRulesOutput = IsTrue<
  AssignableTo<
    readonly ["groups", { kind: "[]" }, "rules", { kind: "[]" }, "output"],
    IRPath
  >
>;

// Physical surface: context (LHS)
type _Assert_PhysicalRulesContext = IsTrue<
  AssignableTo<
    readonly ["groups", { kind: "[]" }, "rules", { kind: "[]" }, "context"],
    IRPath
  >
>;

// Physical surface: stores[]
type _Assert_StoreArray = IsTrue<
  AssignableTo<readonly ["stores", { kind: "[]" }], IRPath>
>;

// Physical surface: stores[].name (leaf field)
type _Assert_StoreName = IsTrue<
  AssignableTo<readonly ["stores", { kind: "[]" }, "name"], IRPath>
>;

// Physical surface: header.bcp47
type _Assert_HeaderBcp47 = IsTrue<
  AssignableTo<readonly ["header", "bcp47"], IRPath>
>;

// Physical surface: header.keyboardId
type _Assert_HeaderKeyboardId = IsTrue<
  AssignableTo<readonly ["header", "keyboardId"], IRPath>
>;

// Physical surface: comments[]
type _Assert_CommentsArray = IsTrue<
  AssignableTo<readonly ["comments", { kind: "[]" }], IRPath>
>;

// Physical surface: recognizedPatterns[] (Pattern is AtomicLeaf — terminal here)
type _Assert_RecognizedPatternsArray = IsTrue<
  AssignableTo<readonly ["recognizedPatterns", { kind: "[]" }], IRPath>
>;

// Touch surface (G3): deep path to keys[]
type _Assert_TouchPath = IsTrue<
  AssignableTo<
    readonly [
      "touchLayout",
      "platforms",
      { kind: "[]" },
      "layers",
      { kind: "[]" },
      "rows",
      { kind: "[]" },
      "keys",
      { kind: "[]" },
    ],
    IRPath
  >
>;

// Visual surface (G3): visualKeyboard.layers[].keys[]
type _Assert_VisualPath = IsTrue<
  AssignableTo<
    readonly ["visualKeyboard", "layers", { kind: "[]" }, "keys", { kind: "[]" }],
    IRPath
  >
>;

// RawKmnFragment is AtomicLeaf — raw[] is a valid path endpoint
type _Assert_RawArray = IsTrue<
  AssignableTo<readonly ["raw", { kind: "[]" }], IRPath>
>;

// Root path (empty tuple) is valid
type _Assert_RootPath = IsTrue<AssignableTo<readonly [], IRPath>>;

// ---------------------------------------------------------------------------
// NEGATIVE assertions — invalid paths must NOT be assignable to IRPath
// Removing any @ts-expect-error below MUST make `pnpm typecheck` fail.
// ---------------------------------------------------------------------------

// Non-existent top-level field
// @ts-expect-error "nonExistentTopLevel" is not a key of KeyboardIR
const _neg_badTopLevel: IRPath = ["nonExistentTopLevel"] as const;

// Valid top-level, invalid child
// @ts-expect-error "bogusChild" is not a key of IRHeader
const _neg_badHeaderChild: IRPath = ["header", "bogusChild"] as const;

// Missing ArrayIndex between "groups" and "rules"
// @ts-expect-error missing ArrayIndex sentinel — "rules" is not a key of IRGroup[]
const _neg_missingArrayIndex: IRPath = ["groups", "rules"] as const;

// Typo in top-level field name
// @ts-expect-error "stors" is not a key of KeyboardIR (typo for "stores")
const _neg_typoTopLevel: IRPath = ["stors"] as const;

// RawKmnFragment sub-fields must NOT be addressable (opaque fragments are not
// survey-editable in v1 — out-of-scope rule; RawKmnFragment is an AtomicLeaf).
// raw[ARRAY_INDEX] is valid (see _Assert_RawArray above), but going deeper is not.
// NOTE: both assertions must be on a single line so @ts-expect-error covers the error.
// @ts-expect-error RawKmnFragment.sourceText is not reachable — RawKmnFragment is AtomicLeaf
const _neg_rawSourceText: IRPath = ["raw", ARRAY_INDEX, "sourceText"] as const;

// @ts-expect-error RawKmnFragment.reason is not reachable — RawKmnFragment is AtomicLeaf
const _neg_rawReason: IRPath = ["raw", ARRAY_INDEX, "reason"] as const;

// Suppress "unused variable" noise — these are assertion-only bindings.
void _neg_badTopLevel;
void _neg_badHeaderChild;
void _neg_missingArrayIndex;
void _neg_typoTopLevel;
void _neg_rawSourceText;
void _neg_rawReason;
