// keyFirstDisplacement -- the Layout tab's key-first view of the Assign tab's displacement
// ledger (spec 117, research R9).
//
// The Assign tab starts from a character and asks where it goes; the Layout tab starts from a
// key and asks what it will type. Both read the same slot-occupancy ledger
// (`buildSlotOccupancy` / `isProducedOnOtherSlot`) and the same decline key
// (`displaced|vkey|mods|incoming`, written by `declineDisplacement`), so the choices in the Layout
// tab are the Assign tab's choices and a decline recorded in one is honoured by the other.
//
// Pure: no store, no timer. The caller passes the recorded declines and `kmn-edits` entries.

import type { KeyboardIR, KmnEdit } from "@keyboard-studio/contracts";
import {
  buildSlotOccupancy,
  displacedFor,
  isProducedOnOtherSlot,
  slotKeyFor,
  type SlotOccupant,
} from "../../survey/slotOccupancy.ts";
import { displacementDismissalKey } from "../assignLoop/useDisplacementProposal.ts";

export interface KeyFirstDisplacement {
  /** What the slot types now and would stop typing; null when it is free or already types `incoming`. */
  displaced: SlotOccupant | null;
  /** True when the displaced glyph is typed on no other slot, so the change would lose it. */
  displacedIsLost: boolean;
  /** Every other slot that already types `incoming`. */
  alreadyTypedAt: Array<{ vkey: string; modifiers: string[] }>;
  /** The `displacedDeclined` key for this displacement; null when nothing is displaced. */
  declineKey: string | null;
  /** True when that key is in the recorded declines, so the choice is not offered again. */
  declined: boolean;
}

export function keyFirstDisplacementFor(
  ir: KeyboardIR | null,
  vkey: string,
  modifiers: readonly string[],
  incoming: string,
  options: { declined?: readonly string[]; kmnEdits?: readonly KmnEdit[] } = {},
): KeyFirstDisplacement {
  const occupancy = buildSlotOccupancy(ir, [], options.kmnEdits ?? []);
  const slotKey = slotKeyFor(vkey, modifiers);
  const displaced = displacedFor(occupancy, vkey, modifiers, incoming);

  const target = incoming.normalize("NFC");
  const alreadyTypedAt: KeyFirstDisplacement["alreadyTypedAt"] = [];
  for (const [key, occupant] of occupancy) {
    if (key === slotKey || occupant.char.normalize("NFC") !== target) continue;
    const [otherVkey = "", mods = ""] = key.split("|");
    alreadyTypedAt.push({ vkey: otherVkey, modifiers: mods === "" ? [] : mods.split(",") });
  }

  const declineKey =
    displaced === null
      ? null
      : displacementDismissalKey({ displacedChar: displaced.char, incomingChar: incoming, vkey, modifiers });
  return {
    displaced,
    displacedIsLost: displaced !== null && !isProducedOnOtherSlot(occupancy, displaced.char, slotKey),
    alreadyTypedAt,
    declineKey,
    declined: declineKey !== null && (options.declined ?? []).includes(declineKey),
  };
}
