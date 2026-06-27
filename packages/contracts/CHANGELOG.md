# Changelog — `@keyboard-studio/contracts`

All notable changes to the `@keyboard-studio/contracts` package are documented
here. The package follows [0ver](https://0ver.org/) semantics while pre-1.0: a
breaking change bumps the **minor** version.

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
