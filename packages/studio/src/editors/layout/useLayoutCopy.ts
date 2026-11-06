// useLayoutCopy — the Layout tab's plain-words copy: cell classes, provenance, read-only reasons,
// and the text a cell's output is read out as (spec 113 FR-012, FR-015, FR-040, FR-041).
//
// These are Content-team strings (FR-041). They live in one hook so the grid cell, the detail
// panel, and the banners cannot word the same fact two ways. The helpers are declared inside the
// hook, closing over the `t` it destructures: Lingui's macro only rewrites a `t` call it can
// trace to that binding, so passing `t` into a module-level helper would render
// "[object Object]" for any interpolated message.

import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { LayerCombo } from "@keyboard-studio/contracts";
import type { ReadOnlyReason } from "@keyboard-studio/engine";
import { formatLayerCombo } from "../assignLoop/keyGrid/LayerSelector.tsx";
import { codepointLabel } from "../../survey/codepointLabel.ts";
import type { CellKind, CellProvenance, DesktopCellViewModel } from "./desktopGridViewModel.ts";

export interface LayoutCopy {
  /** "Default" for the unshifted layer, otherwise "Shift+AltGr" style. */
  layerName: (layer: LayerCombo) => string;
  /** The output class, in words (FR-012). */
  kindLabel: (kind: CellKind) => string;
  /** Where the behaviour comes from, in words (FR-012). */
  provenanceLabel: (provenance: CellProvenance) => string;
  /** The one-word form drawn on the cell. */
  provenanceShort: (provenance: CellProvenance) => string;
  /** Why a cell or row is read-only, in plain words (FR-015). */
  readOnlyReasonText: (reason: ReadOnlyReason) => string;
  /** What the cell does, as a sentence fragment a screen reader can speak (characters are named by code point). */
  outputPhrase: (cell: DesktopCellViewModel) => string;
  /** What K_oE2 is, since the key has no standard caption (a base keyboard may lack it). */
  isoExtraKeyNote: () => string;
  /** The whole accessible name of a grid cell (FR-040): key, layer, output, class, provenance, editability. */
  cellAriaLabel: (cell: DesktopCellViewModel) => string;
}

export function useLayoutCopy(): LayoutCopy {
  const { t } = useLingui();

  function layerName(layer: LayerCombo): string {
    return layer.length === 0
      ? t({ id: "editor.layout.layer.default", message: "Default" })
      : formatLayerCombo(layer);
  }

  function kindLabel(kind: CellKind): string {
    switch (kind) {
      case "text":
        return t({ id: "editor.layout.kind.text", message: "Text" });
      case "deadkey":
        return t({ id: "editor.layout.kind.deadkey", message: "Deadkey" });
      case "nothing":
        return t({ id: "editor.layout.kind.nothing", message: "Types nothing" });
      case "complex":
        return t({ id: "editor.layout.kind.complex", message: "Complex output" });
      case "opaque":
        return t({ id: "editor.layout.kind.opaque", message: "Code the studio cannot show here" });
      case "frame":
        return t({ id: "editor.layout.kind.frame", message: "Frame key" });
      case "unknown":
        return t({ id: "editor.layout.kind.unknown", message: "Unknown" });
      case "system-shortcut":
        return t({ id: "editor.layout.kind.systemShortcut", message: "System shortcut" });
      default: {
        const unreachable: never = kind;
        return unreachable;
      }
    }
  }

  function provenanceLabel(provenance: CellProvenance): string {
    switch (provenance) {
      case "hand-set":
        return t({ id: "editor.layout.provenance.handSet", message: "Hand-set" });
      case "starting-point":
        return t({ id: "editor.layout.provenance.startingPoint", message: "From the starting point" });
      case "base-fallback":
        return t({ id: "editor.layout.provenance.baseFallback", message: "Base keyboard fallback" });
      default: {
        const unreachable: never = provenance;
        return unreachable;
      }
    }
  }

  function provenanceShort(provenance: CellProvenance): string {
    switch (provenance) {
      case "hand-set":
        return t({ id: "editor.layout.provenance.handSetShort", message: "Set" });
      case "starting-point":
        return t({ id: "editor.layout.provenance.startingPointShort", message: "Start" });
      case "base-fallback":
        return t({ id: "editor.layout.provenance.baseFallbackShort", message: "Base" });
      default: {
        const unreachable: never = provenance;
        return unreachable;
      }
    }
  }

  function readOnlyReasonText(reason: ReadOnlyReason): string {
    switch (reason) {
      case "store-based":
        return t({
          id: "editor.layout.readOnly.storeBased",
          message:
            "This rule picks its output from a list of characters (any, index or notany), which the Layout tab cannot change safely. Open it in the Code tab to edit it.",
        });
      case "conditional":
        return t({
          id: "editor.layout.readOnly.conditional",
          message:
            "This rule only applies under a condition (if, platform or an option), so what it types can change. Open it in the Code tab to edit it.",
        });
      case "opaque":
        return t({
          id: "editor.layout.readOnly.opaque",
          message:
            "This key is covered by code the studio cannot show here. Open it in the Code tab to edit it.",
        });
      case "readonly-group":
        return t({
          id: "editor.layout.readOnly.readonlyGroup",
          message:
            "This rule sits in a part of the keyboard the studio keeps read-only. Open it in the Code tab to edit it.",
        });
      case "complex-output":
        return t({
          id: "editor.layout.readOnly.complexOutput",
          message:
            "This rule does more than type plain text, for example it beeps or reorders what came before. Open it in the Code tab to edit it.",
        });
      case "later-group-change":
        return t({
          id: "editor.layout.readOnly.laterGroupChange",
          message:
            "A later rule group changes what this key types, so the stored rule is not what the keyboard produces. Open it in the Code tab to edit it.",
        });
      case "never-fires":
        return t({
          id: "editor.layout.readOnly.neverFires",
          message:
            "An earlier rule always handles this keystroke first, so this rule never fires. Open it in the Code tab to edit it.",
        });
      case "mnemonic":
        return t({
          id: "editor.layout.readOnly.mnemonic",
          message:
            "This keyboard is mnemonic: its keys follow the typist's own keyboard layout, so the Layout tab cannot show or change a fixed position for each key. Use the Code tab.",
        });
      case "frame-key":
        return t({
          id: "editor.layout.readOnly.frameKey",
          message: "This key is part of the keyboard's frame (Enter, Shift, Tab and so on), so it is not edited here.",
        });
      case "not-compiled":
        return t({
          id: "editor.layout.readOnly.notCompiled",
          message:
            "The keyboard has not compiled yet, so the studio cannot check what this key types. It becomes editable once the keyboard compiles.",
        });
      default: {
        const unreachable: never = reason;
        return unreachable;
      }
    }
  }

  function typesText(text: string): string {
    return t({
      id: "editor.layout.output.text",
      message: `types ${{ text }} (${{ name: codepointLabel(text).title }})`,
    });
  }

  function outputPhrase(cell: DesktopCellViewModel): string {
    if (cell.state === "not-compiled" && cell.kind !== "frame") {
      return t({ id: "editor.layout.output.notCompiled", message: "not compiled yet" });
    }
    switch (cell.kind) {
      case "text": {
        if (cell.display === null || cell.display === "") {
          return t({ id: "editor.layout.output.nothing", message: "types nothing" });
        }
        return typesText(cell.display);
      }
      case "deadkey": {
        const dk = cell.deadkey;
        if (dk === undefined) {
          return t({ id: "editor.layout.output.deadkeyBase", message: "starts a deadkey" });
        }
        const name = t({ id: "editor.layout.output.deadkey", message: `deadkey ${{ id: dk.id }}` });
        const combos = t({
          id: "editor.layout.output.deadkeyCombinations",
          message: plural(dk.combinationCount, {
            one: "completes # combination",
            other: "completes # combinations",
          }),
        });
        return `${name}, ${combos}`;
      }
      case "nothing":
        return t({ id: "editor.layout.output.nothing", message: "types nothing" });
      case "complex":
        // A key a later group changes still shows what the compiled keyboard really types.
        if (cell.display !== null && cell.display !== "") return typesText(cell.display);
        return t({ id: "editor.layout.output.complex", message: "complex output" });
      case "opaque":
        return t({ id: "editor.layout.output.opaque", message: "code the studio cannot show here" });
      case "frame":
        return t({ id: "editor.layout.output.frame", message: "frame key" });
      case "unknown":
        return t({ id: "editor.layout.output.unknown", message: "unknown, no base keyboard data" });
      case "system-shortcut":
        return t({ id: "editor.layout.output.systemShortcut", message: "a system shortcut, not a typed character" });
      default: {
        const unreachable: never = cell.kind;
        return unreachable;
      }
    }
  }

  /** K_oE2 has no standard caption: it is the extra key some keyboards carry beside left Shift. */
  function isoExtraKeyNote(): string {
    return t({ id: "editor.layout.cell.isoExtraKey", message: "extra key beside left Shift (ISO keyboards)" });
  }

  function cellAriaLabel(cell: DesktopCellViewModel): string {
    const head = t({
      id: "editor.layout.cell.ariaLabel",
      message: `Key ${{ key: cell.keyLabel }}, layer ${{ layer: layerName(cell.layer) }}`,
    });
    const parts: string[] = [head];
    if (cell.vkey === "K_oE2") parts.push(isoExtraKeyNote());
    parts.push(outputPhrase(cell), kindLabel(cell.kind));
    if (cell.provenance !== null) parts.push(provenanceLabel(cell.provenance));
    if (!cell.frame) {
      parts.push(
        cell.editable
          ? t({ id: "editor.layout.cell.editable", message: "editable" })
          : t({ id: "editor.layout.cell.readOnly", message: "read-only" }),
      );
    }
    if (cell.hasContextualRows) {
      parts.push(t({ id: "editor.layout.cell.hasContextualRows", message: "also used after other characters" }));
    }
    return parts.join(", ");
  }

  return {
    layerName,
    kindLabel,
    provenanceLabel,
    provenanceShort,
    readOnlyReasonText,
    outputPhrase,
    isoExtraKeyNote,
    cellAriaLabel,
  };
}
