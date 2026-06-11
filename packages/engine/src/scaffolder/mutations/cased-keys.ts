/**
 * IR mutation: insert &CasedKeys store.
 *
 * Pushes a new &CasedKeys system store onto ir.stores when:
 *   - group is not "non-roman", AND
 *   - no &CasedKeys store already exists (idempotent)
 *
 * The store uses a {kind:"raw"} StoreItem so that the range strings emit
 * verbatim (the codec has no range-vkey support — emit.ts has no range emitter).
 *
 * CasedKeys values (copied verbatim from original scaffolder/index.ts:75-78):
 *   azerty:          [K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]
 *   qwerty-qwertz:   [K_A]..[K_Z]
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { RoutingGroup } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../../codec/node-ids.js";
import { findSystemStore } from "../kmn-utils.js";

const CASED_KEYS_AZERTY =
  "[K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]";
const CASED_KEYS_QWERTY = "[K_A]..[K_Z]";

/**
 * Mutate (shallow-clone) a KeyboardIR to insert a &CasedKeys system store.
 *
 * No-op when:
 *   - group === "non-roman", OR
 *   - a &CasedKeys store already exists in ir.stores
 *
 * The store's items array contains a single {kind:"raw"} item with the
 * appropriate range string so emit() renders it verbatim.
 *
 * @param ir     The source IR (not mutated in-place).
 * @param group  Three-group routing variant.
 * @returns      A new KeyboardIR with the &CasedKeys store appended (or
 *               the original IR unchanged if the guard conditions apply).
 */
export function mutateInsertCasedKeys(ir: KeyboardIR, group: RoutingGroup): KeyboardIR {
  if (group === "non-roman") return ir;

  const alreadyExists = findSystemStore(ir, "CASEDKEYS") !== undefined;
  if (alreadyExists) return ir;

  const minter = new NodeIdMinter();
  const value = group === "azerty" ? CASED_KEYS_AZERTY : CASED_KEYS_QWERTY;

  const newStore = {
    nodeId: minter.mint("store"),
    name: "CasedKeys",
    isSystem: true,
    items: [{ kind: "raw" as const, text: value }],
  };

  return { ...ir, stores: [...ir.stores, newStore] };
}
