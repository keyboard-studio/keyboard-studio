# Spec 009 Flow-map editor: as built

**Status:** Retired 2026-10-14. **Never built.**
**Full docs:** [specs/_archive/009-flow-map-editor/](../_archive/009-flow-map-editor/) (spec). Not read by default.

## What shipped
- Nothing of this spec. No editor exists; no code writes `*.modular.yaml` (the format was deleted from the tree; `content/flows/` holds only a README).

## Why it is retired
- The spec required a visual editor that writes back to the modular-YAML flow files. That format and its manifest order were replaced by the decision registry (specs 087/091): order is derived, and flow surfaces (Flow Map, Library) are read-only views over the derivation. An editor for the deleted format has no object to edit.
