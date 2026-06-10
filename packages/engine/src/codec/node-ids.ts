/**
 * Stable nodeId minting for KeyboardIR nodes.
 *
 * IDs are of the form `<kind>#<n>` where n is a monotonically increasing
 * counter per kind. Callers should create one NodeIdMinter per parse pass so
 * that IDs are deterministic across identical inputs.
 */

import type { IRNodeRef } from "@keyboard-studio/contracts";

export class NodeIdMinter {
  private readonly counters = new Map<string, number>();

  /**
   * Mint the next ID for the given kind, e.g. `rule#0`, `store#3`.
   */
  mint(kind: IRNodeRef["kind"]): string {
    const n = this.counters.get(kind) ?? 0;
    this.counters.set(kind, n + 1);
    return `${kind}#${n}`;
  }
}
