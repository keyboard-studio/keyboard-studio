import { assertNever } from "../assert-never";
import type { StoreItem } from "../keyboard-ir";

/**
 * The literal text a store item contributes when a store is read as a string:
 * a `char` contributes its value and a `raw` item its verbatim text. Every other
 * kind (`vkey`, `deadkey`, `namedDeadkey`, `any`, `outs`) contributes no text and yields
 * `nonText` (default `""`). The switch is exhaustive, so a new `StoreItem` kind
 * is a compile error here rather than a silent fall-through at every caller.
 */
export function storeItemText(item: StoreItem, nonText = ""): string {
  switch (item.kind) {
    case "char":
      return item.value;
    case "raw":
      return item.text;
    case "outs":
      return nonText; // a reference, not text: callers holding the IR expand it with resolveStoreItems
    case "vkey":
    case "deadkey":
    case "namedDeadkey":
    case "any":
      return nonText;
    default:
      return assertNever(item, "storeItemText");
  }
}
