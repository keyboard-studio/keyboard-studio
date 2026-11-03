// TouchCodePane — the touch step's "Code" tab.
//
// Phase 0 stub: mounts behind the third tab so tab mechanics, carry
// semantics, and persistence can land and be tested before the Monaco editor
// (Phase 2) is wired in. Phase 2 replaces this stub with the real editor:
// lazy-loaded Monaco over `emitTouchLayout(effectiveKeyModeLayout)`, JSON
// syntax highlighting, the 18-x keyboard-lint pipeline, and a diff→
// op-sequence Apply committed as one undo batch (slice-spec §5).
//
// The pane reads shared layout state only — it never holds a layout copy
// ("view swap, not a fork", FR-036a/b).

export function TouchCodePane() {
  return <div data-testid="touch-code-pane" />;
}
