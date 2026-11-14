// Types for the Layout-tab edit operations (spec 117, contracts/layout-ops.md).

import type { IRRule } from "@keyboard-studio/contracts";

/**
 * What one applied edit did to the entry group, enough to undo it locally
 * (`invertEffect`) without a rebuild.
 *
 * `removed[].index` is the rule's position in the group BEFORE the edit, so
 * once the inserted nodes are dropped, re-inserting the removed rules in
 * ascending `index` order restores the original order exactly.
 */
export interface KmnEditEffect {
  /** nodeId of the edited group; empty when the edit had no IR effect. */
  groupNodeId: string;
  /** nodeIds of the rules the edit inserted. */
  inserted: string[];
  /** Rules the edit removed, with their pre-edit positions (ascending). */
  removed: Array<{ rule: IRRule; index: number }>;
}

/** What `replayKmnEdits` could not apply: a Code-tab change whose content anchor is gone (US8). */
export interface ReplayMiss {
  seq: number;
  reason: string;
}
