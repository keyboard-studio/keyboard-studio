// Shared types for the CharacterMapPane extraction — split out so sibling
// files (the group-render section, the raw code-point entry) can reference
// CharacterMapCell without importing back from CharacterMapPane.tsx itself
// (which would create a circular import once those pieces move out).

import type { CharacterMapGroup } from "../../lib/services.ts";

// A single cell within a CharacterMapGroup — derived rather than imported by
// name so this file depends on exactly one (not-yet-landed) engine symbol,
// CharacterMapGroup, via services.ts's re-export.
export type CharacterMapCell = CharacterMapGroup["cells"][number];
