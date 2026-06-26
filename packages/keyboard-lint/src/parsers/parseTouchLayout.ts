// .keyman-touch-layout parsing for the lint checks.
//
// The parser itself is the canonical shared implementation in
// @keyboard-studio/contracts (issue #354) — engine codec and keyboard-lint
// parse identically. This module re-exports the VFS-adapter entry point (and
// the path helper) under the names the lint checks already use, so the lint
// package keeps a contracts-only dependency (it must not import the engine,
// spec §10).

export {
  parseTouchLayoutFromVfs as parseTouchLayout,
  touchLayoutPath,
} from "@keyboard-studio/contracts";
