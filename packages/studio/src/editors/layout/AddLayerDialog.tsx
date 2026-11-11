// AddLayerDialog — add any modifier combination as a layer (spec 117 FR-010a).
//
// The author builds a combination from the four modifier families (Shift, Ctrl, Alt, Caps Lock);
// at most one token comes from each family, so an impossible combination cannot be assembled.
// The studio never adds a layer on its own. A combination with Ctrl or Alt but without AltGr is
// the host's shortcut set when typed with a letter, so that consequence is shown before the
// author confirms. The dialog only reports the chosen layer; the pane keeps it as session state.
//
// The modal frame (focus trap, Escape, backdrop) is the shared `ui/Dialog`; the caller restores
// focus to the button that opened it.

import { useId, useState } from "react";
import type { ChangeEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LayerCombo, ModifierToken } from "@keyboard-studio/contracts";
import { Button, Dialog } from "../../ui/index.ts";
import { TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { formatLayerCombo } from "../assignLoop/keyGrid/LayerSelector.tsx";
import { ALT_FAMILY, CAPS_FAMILY, CTRL_FAMILY, canonicalLayer, isSystemShortcutLayer, layerKey } from "./layerList.ts";

export interface AddLayerDialogProps {
  open: boolean;
  onCancel: () => void;
  /** Called with the canonical combination when the author confirms. */
  onConfirm: (layer: LayerCombo) => void;
  /** Layers already listed, by `layerKey`: adding one of them just selects it. */
  listedKeys?: ReadonlySet<string>;
}

type Choice = ModifierToken | "";

export function AddLayerDialog({ open, onCancel, onConfirm, listedKeys }: AddLayerDialogProps) {
  const { t } = useLingui();
  const uid = useId();
  const [shift, setShift] = useState(false);
  const [ctrl, setCtrl] = useState<Choice>("");
  const [alt, setAlt] = useState<Choice>("");
  const [caps, setCaps] = useState<Choice>("");

  const tokens: ModifierToken[] = [];
  if (shift) tokens.push("SHIFT");
  for (const c of [ctrl, alt, caps]) if (c !== "") tokens.push(c);
  const layer = canonicalLayer(tokens);
  const empty = layer !== null && layer.length === 0;
  const alreadyListed = layer !== null && !empty && listedKeys?.has(layerKey(layer)) === true;
  const shortcut = layer !== null && isSystemShortcutLayer(layer);

  const tokenName = (token: ModifierToken): string => {
    switch (token) {
      case "CTRL":
        return t({ id: "editor.layout.addLayer.ctrl", message: "Ctrl" });
      case "LCTRL":
        return t({ id: "editor.layout.addLayer.leftCtrl", message: "Left Ctrl" });
      case "RCTRL":
        return t({ id: "editor.layout.addLayer.rightCtrl", message: "Right Ctrl" });
      case "ALT":
        return t({ id: "editor.layout.addLayer.alt", message: "Alt" });
      case "LALT":
        return t({ id: "editor.layout.addLayer.leftAlt", message: "Left Alt" });
      case "RALT":
        return t({ id: "editor.layout.addLayer.altGr", message: "AltGr (Right Alt)" });
      case "CAPS":
        return t({ id: "editor.layout.addLayer.capsOn", message: "Caps Lock on" });
      case "NCAPS":
        return t({ id: "editor.layout.addLayer.capsOff", message: "Caps Lock off" });
      case "SHIFT":
        return t({ id: "editor.layout.addLayer.shift", message: "Shift" });
      default: {
        const unreachable: never = token;
        return unreachable;
      }
    }
  };

  const none = t({ id: "editor.layout.addLayer.none", message: "Not used" });

  function reset(): void {
    setShift(false);
    setCtrl("");
    setAlt("");
    setCaps("");
  }

  /** A change handler that only ever stores a token of `family`, or the empty choice. */
  function pick(set: (c: Choice) => void, family: readonly ModifierToken[]) {
    return (e: ChangeEvent<HTMLSelectElement>) => set(family.find((token) => token === e.target.value) ?? "");
  }

  function select(
    id: string,
    testId: string,
    label: string,
    value: Choice,
    onChange: (e: ChangeEvent<HTMLSelectElement>) => void,
    family: readonly ModifierToken[],
  ) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label htmlFor={id} style={{ fontSize: 11, color: TEXT_DIM }}>
          {label}
        </label>
        <select id={id} value={value} onChange={onChange} data-testid={testId}>
          <option value="">{none}</option>
          {family.map((token) => (
            <option key={token} value={token}>
              {tokenName(token)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function handleConfirm(e: { preventDefault: () => void }): void {
    e.preventDefault();
    if (layer === null || empty) return;
    onConfirm(layer);
    reset();
  }

  function handleCancel(): void {
    reset();
    onCancel();
  }

  return (
    <Dialog
      open={open}
      onCancel={handleCancel}
      label={t({ id: "editor.layout.addLayer.title", message: "Add layer" })}
      testId="add-layer-dialog"
      minWidth={320}
      maxWidth={440}
      onSubmit={handleConfirm}
    >
      <p style={{ margin: 0, fontSize: 13, color: TEXT_MAIN, fontFamily: FONT }}>
        {t({
          id: "editor.layout.addLayer.intro",
          message:
            "Choose the modifier keys that select the new layer. Its keys show what the base keyboard types until you set them.",
        })}
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: TEXT_MAIN }}>
        <input
          type="checkbox"
          checked={shift}
          onChange={(e) => setShift(e.target.checked)}
          data-testid="add-layer-shift"
        />
        {tokenName("SHIFT")}
      </label>
      {select(`${uid}-ctrl`, "add-layer-ctrl", t({ id: "editor.layout.addLayer.ctrlLabel", message: "Ctrl" }), ctrl, pick(setCtrl, CTRL_FAMILY), CTRL_FAMILY)}
      {select(`${uid}-alt`, "add-layer-alt", t({ id: "editor.layout.addLayer.altLabel", message: "Alt" }), alt, pick(setAlt, ALT_FAMILY), ALT_FAMILY)}
      {select(`${uid}-caps`, "add-layer-caps", t({ id: "editor.layout.addLayer.capsLabel", message: "Caps Lock" }), caps, pick(setCaps, CAPS_FAMILY), CAPS_FAMILY)}

      <p style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }} data-testid="add-layer-preview">
        {layer === null || empty
          ? t({
              id: "editor.layout.addLayer.previewNone",
              message: "Choose at least one modifier. The default layer is always listed.",
            })
          : t({
              id: "editor.layout.addLayer.preview",
              message: `New layer: ${{ name: formatLayerCombo(layer) }}`,
            })}
      </p>
      {alreadyListed && (
        <p role="status" style={{ margin: 0, fontSize: 12, color: TEXT_DIM }} data-testid="add-layer-listed">
          {t({
            id: "editor.layout.addLayer.alreadyListed",
            message: "This layer is already listed. Adding it just selects it.",
          })}
        </p>
      )}
      {shortcut && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: TEXT_MAIN }} data-testid="add-layer-shortcut">
          {t({
            id: "editor.layout.addLayer.shortcutWarning",
            message:
              "Ctrl or Alt with a letter key is a shortcut in Windows and in most programs, so those keys may never reach your keyboard. You can still add this layer.",
          })}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="secondary" onClick={handleCancel} data-testid="add-layer-cancel">
          {t({ id: "editor.layout.addLayer.cancel", message: "Cancel" })}
        </Button>
        <Button type="submit" variant="primary" disabled={layer === null || empty} data-testid="add-layer-confirm">
          {shortcut
            ? t({ id: "editor.layout.addLayer.confirmAnyway", message: "Add layer anyway" })
            : t({ id: "editor.layout.addLayer.confirm", message: "Add layer" })}
        </Button>
      </div>
    </Dialog>
  );
}
