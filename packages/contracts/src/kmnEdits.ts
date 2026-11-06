// The `kmn-edits` decision value (spec 113, contracts/layout-ops.md).
//
// Every confirmed Layout-tab edit is one entry; entries replay in order and
// later entries win. Code-tab entries (`CodeEdit`, `ReviewKept`) join this
// union in Phase 6 (contracts/code-edits.md).
import type { LayoutOperation } from "./layoutOps";

export type KmnEdit = LayoutOperation;

export interface KmnEditsValue {
  entries: KmnEdit[];
}
