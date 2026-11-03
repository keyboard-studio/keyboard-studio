// placementOps — pure planner for the placement bar's drop modal.
//
// Given a dropped letter, the target key, and the user's modal choice, this
// builds the `PendingKeyEditOperation` sequence the pane commits (one undo
// batch via sequential `commitKeyEdit` calls, slice-spec §4). Pure and
// unit-tested; the pane owns drag state, the modal, and the tray.
//
// Slot semantics:
// - surface: the key's face — `set` text+output to the letter, so the key
//   produces it. A displaced surface glyph can be demoted to a longpress or
//   sent back to the placement tray.
// - longpress: append a longpress subkey (never replaces).
// - flick: upsert the direction slot; a displaced flick glyph can be demoted
//   or sent back like a surface.
// - multitap: 2x = the letter on double-tap (multitap[0]), 3x = triple-tap
//   (multitap[1]). The contract has no reorder op, so this removes the
//   existing multitap entries and re-adds them in the new order — nothing is
//   displaced, only reordered.
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";
import type { FlickDirection } from "./touchBuilderModel.ts";

/** Key class union, mirroring the engine's `EditableKeySp`. */
type KeySp = 0 | 1 | 2 | 8 | 9 | 10;

/** What the placement modal resolved to. */
export type PlacementChoice =
  | { slot: "surface"; displaced: "demote" | "sendBack" | null }
  | { slot: "longpress" }
  | { slot: "flick"; direction: FlickDirection; displaced: "demote" | "sendBack" | null }
  | { slot: "multitap"; tap: 2 | 3 };

export interface PlacementOpPlan {
  readonly ops: PendingKeyEditOperation[];
  /** Displaced glyph the user sent back to the placement tray. */
  readonly displacedBackToTray: string | null;
}

/**
 * True when the text is a real glyph worth preserving on displace — not
 * empty and not a `*Special*` key alias.
 */
export function isPreservableText(text: string | undefined): boolean {
  return text !== undefined && text !== "" && !/^\*[^*]+\*$/.test(text);
}

/**
 * The glyph currently occupying the choice's slot, when one is worth
 * preserving (null when the slot is empty or holds a special alias).
 */
export function placementOccupant(
  targetKey: TouchKeyIR,
  choice: PlacementChoice,
): string | null {
  if (choice.slot === "surface") {
    return isPreservableText(targetKey.text) ? targetKey.text! : null;
  }
  if (choice.slot === "flick") {
    const text = targetKey.flick?.[choice.direction]?.text;
    return isPreservableText(text) ? text! : null;
  }
  return null;
}

/**
 * Build the op sequence for a placement. `freshId` is the one minted
 * subkey id this plan may consume (every branch needs at most one).
 */
export function buildPlacementOps(
  address: string,
  targetKey: TouchKeyIR,
  letter: string,
  choice: PlacementChoice,
  freshId: string,
): PlacementOpPlan {
  const ops: PendingKeyEditOperation[] = [];
  let displacedBackToTray: string | null = null;

  const demoteToLongpress = (text: string): void => {
    ops.push({
      address,
      kind: "setSubKey",
      sub: { kind: "sk", id: freshId },
      fields: { id: freshId, text, sp: 0 },
    });
  };

  const handleDisplaced = (
    displaced: "demote" | "sendBack" | null,
    occupant: string | null,
  ): void => {
    if (occupant === null) return;
    if (displaced === "demote") demoteToLongpress(occupant);
    else if (displaced === "sendBack") displacedBackToTray = occupant;
  };

  switch (choice.slot) {
    case "surface": {
      // text is the face; output follows so the key produces the letter even
      // when the key previously carried a divergent explicit output.
      ops.push({ address, kind: "set", fields: { text: letter, output: letter } });
      handleDisplaced(choice.displaced, placementOccupant(targetKey, choice));
      break;
    }
    case "longpress": {
      ops.push({
        address,
        kind: "setSubKey",
        sub: { kind: "sk", id: freshId },
        fields: { id: freshId, text: letter, sp: 0 },
      });
      break;
    }
    case "flick": {
      ops.push({
        address,
        kind: "setSubKey",
        sub: { kind: "flick", id: choice.direction },
        fields: { id: choice.direction, text: letter, sp: 0 },
      });
      handleDisplaced(choice.displaced, placementOccupant(targetKey, choice));
      break;
    }
    case "multitap": {
      const existing = targetKey.multitap ?? [];
      const ordered: { id: string; text: string; sp: KeySp; output?: string }[] =
        existing.map((s) => ({
          id: s.id,
          text: s.text ?? "",
          sp: (s.sp ?? 0) as KeySp,
          ...(s.output !== undefined ? { output: s.output } : {}),
        }));
      const newcomer = { id: freshId, text: letter, sp: 0 as KeySp };
      if (choice.tap === 2) ordered.unshift(newcomer);
      else ordered.splice(1, 0, newcomer);
      for (const s of existing) {
        ops.push({ address, kind: "removeSubKey", sub: { kind: "multitap", id: s.id } });
      }
      for (const s of ordered) {
        ops.push({
          address,
          kind: "setSubKey",
          sub: { kind: "multitap", id: s.id },
          fields: {
            id: s.id,
            text: s.text,
            sp: s.sp,
            ...(s.output !== undefined ? { output: s.output } : {}),
          },
        });
      }
      break;
    }
  }
  return { ops, displacedBackToTray };
}

/** Touch-drag disambiguation for a tray chip (HTML5 DnD never fires on touch). */
export type TouchGestureIntent = "undecided" | "scroll" | "drag";

/**
 * Classify a touch pointer's displacement from its down point. Below the
 * slop the gesture is undecided (a tap in the making); beyond it, the
 * dominant axis wins — horizontal means the tray scrolls (the browser keeps
 * the gesture), vertical means a drag starts immediately, no longpress.
 */
export function touchGestureIntent(
  dx: number,
  dy: number,
  slop = 10,
): TouchGestureIntent {
  if (Math.hypot(dx, dy) < slop) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "scroll" : "drag";
}
