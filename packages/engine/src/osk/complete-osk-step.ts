/**
 * OSK editor Continue payload — shared by OskEditor and the headless author.
 *
 * The studio step hands the emitted `.kvks` XML to onComplete; callers that
 * have no generated keyboard pass through as `undefined`.
 */

import type { KvksIR } from "@keyboard-studio/contracts";
import { emitKvks } from "../codec/emit-kvks.js";

export interface OskContinueResult {
  kvksXml: string;
}

/** Build the OSK step's completion value from the effective KvksIR snapshot. */
export function oskContinueResult(kvks: KvksIR | null): OskContinueResult | undefined {
  if (kvks === null) {
    return undefined;
  }
  return { kvksXml: emitKvks(kvks) };
}
