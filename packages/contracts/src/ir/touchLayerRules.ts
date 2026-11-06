/**
 * Touch layer naming and modifier-key rules shared by the touch upgrade
 * fixers (engine) and their lint checks (keyboard-lint), so a check and the
 * fixer that repairs it cannot drift apart.
 *
 * The rules follow the owner's `processTouch.py` (Template Cleanup), with layer
 * ids as Keyman names them: only Keyman's standard modifier layer ids are
 * modifier-aware (a key on them types with those modifiers), so Ctrl+Shift is
 * `shift-ctrl`, never `ctrl-shift`. All functions are pure and accept the wire
 * form (strings) or the IR form (numbers) of `sp`.
 */

/**
 * Keyman's modifier layer naming (TIKE layoutbuilder `constants.ts`,
 * `getModifierCombinationName`): the modifiers present, in this order, joined
 * by `-`; no modifiers is `default`.
 */
const KEYMAN_LAYER_MODIFIER_ORDER = [
  "leftctrl", "rightctrl", "leftalt", "rightalt", "shift", "ctrl", "alt", "caps",
] as const;

type LayerModifier = (typeof KEYMAN_LAYER_MODIFIER_ORDER)[number];

/** Keyman's layer id for a set of modifiers. */
export function keymanModifierLayerId(mods: Iterable<LayerModifier>): string {
  const set = new Set(mods);
  const id = KEYMAN_LAYER_MODIFIER_ORDER.filter((m) => set.has(m)).join("-");
  return id === "" ? "default" : id;
}

/** The modifier combinations the touch layout editor offers, without Caps (TIKE `validModifierCombinations`). */
const KEYMAN_LAYER_COMBINATIONS: ReadonlyArray<readonly LayerModifier[]> = [
  [], ["leftctrl"], ["rightctrl"], ["leftalt"], ["leftctrl", "leftalt"], ["rightalt"],
  ["rightctrl", "rightalt"], ["shift"], ["leftctrl", "shift"], ["leftalt", "shift"],
  ["leftctrl", "leftalt", "shift"], ["rightctrl", "shift"], ["rightalt", "shift"],
  ["rightctrl", "rightalt", "shift"], ["ctrl"], ["ctrl", "shift"], ["alt"], ["ctrl", "alt"],
  ["shift", "alt"], ["shift", "ctrl", "alt"],
];

/** A key's `sp` as a number, or undefined when absent or not numeric. */
export function touchSpValue(sp: string | number | undefined | null): number | undefined {
  if (sp === undefined || sp === null || sp === "") return undefined;
  const n = Number(sp);
  return Number.isFinite(n) ? n : undefined;
}

/** True for any caps layer, including `symbol-caps`. */
export function isTouchCapsLayerId(id: string): boolean {
  return id.toLowerCase().includes("caps");
}

/** True for any shift layer, including `rightalt-shift` and `shift-ralt`. */
export function isTouchShiftLayerId(id: string): boolean {
  return id.toLowerCase().includes("shift");
}

/**
 * The caps layer built from each standard shift layer: Caps in place of Shift,
 * named as Keyman names it (`shift` -> `caps`, `rightalt-shift` ->
 * `rightalt-caps`, `shift-ctrl` -> `ctrl-caps`).
 */
export const TOUCH_CAPS_FROM_SHIFT: ReadonlyArray<readonly [shift: string, caps: string]> =
  KEYMAN_LAYER_COMBINATIONS.filter((c) => c.includes("shift")).map((c) => [
    keymanModifierLayerId(c),
    keymanModifierLayerId([...c.filter((m) => m !== "shift"), "caps"]),
  ]);

/**
 * The layer a shift or caps layer's Shift key returns to: `shift` and `caps`
 * return to `default`, `X-shift` / `shift-X` / `X-caps` / `caps-X` to `X`.
 * Undefined when the layer is neither or the target layer does not exist.
 */
export function unshiftedTouchLayerId(id: string, layerIds: ReadonlySet<string>): string | undefined {
  const lower = id.toLowerCase();
  const word = lower.includes("shift") ? "shift" : lower.includes("caps") ? "caps" : undefined;
  if (word === undefined) return undefined;
  const rest = lower
    .replace(new RegExp(`^${word}-`), "")
    .replace(new RegExp(`-${word}$`), "")
    .replace(new RegExp(`^${word}$`), "default");
  if (rest === lower) return undefined;
  const found = [...layerIds].find((l) => l.toLowerCase() === rest);
  return found;
}

/** The caps layer a double-tap on Shift reaches from `id`, when that layer exists. */
export function touchDoubleTapTarget(id: string, layerIds: ReadonlySet<string>): string | undefined {
  // The caps layer whose Caps-less form is `id`: default -> caps, rightalt -> rightalt-caps.
  const target = TOUCH_CAPS_FROM_SHIFT.find(([, caps]) =>
    (caps === "caps" ? "default" : caps.replace(/-caps$/, "")) === id,
  )?.[1];
  return target !== undefined && layerIds.has(target) ? target : undefined;
}

/**
 * True for a key that, on a layer other than default and caps, should return
 * to `default` after one tap (one-shot Shift): not a special (1), active
 * special (2), deadkey (8), blank (9) or spacer (10) key.
 */
export function isTouchOneShotKey(sp: string | number | undefined | null): boolean {
  const n = touchSpValue(sp);
  return n === undefined || !(n === 1 || n === 2 || n === 8 || n === 9 || n === 10);
}

// ---------------------------------------------------------------------------
// Ctrl / RAlt modifier keys (process_modifier_key)
// ---------------------------------------------------------------------------

const MODIFIER_KEY_IDS: ReadonlySet<string> = new Set([
  "K_LCONTROL",
  "K_RCONTROL",
  "K_CONTROL",
  "K_ALT",
  "K_RALT",
  "K_LALT",
]);

/** The fields a modifier key must have, limited to those that differ. */
export interface TouchModifierKeyPatch {
  id?: string;
  text?: string;
  sp?: number;
  nextlayer?: string;
}

const isRaltLayer = (lid: string): boolean => /rightalt|ralt/i.test(lid);
const isCtrlLayer = (lid: string): boolean => /ctrl|control/i.test(lid);

/** The shift state a layer id names: shift, caps or default. */
function shiftStateOf(lid: string): "shift" | "caps" | "default" {
  if (isTouchCapsLayerId(lid)) return "caps";
  if (isTouchShiftLayerId(lid)) return "shift";
  return "default";
}

/**
 * What a Ctrl or RAlt key (ids `K_LCONTROL` ... `K_LALT`, not blank) must look
 * like on layer `layerId`: ids `K_RALT`, labels `*Ctrl*` / `*RAlt*`, the
 * layer it opens (the matching shift or caps variant when one exists), and the
 * active-special style (sp 2) on the layer that key opened. A key whose label
 * is not one of the legacy spellings is left alone. Returns `{}` when the key
 * is already consistent or is not a modifier key.
 */
export function touchModifierKeyPatch(
  layerId: string,
  key: { id?: string; text?: string; sp?: string | number | null; nextlayer?: string | null },
  layerIds: ReadonlySet<string>,
): TouchModifierKeyPatch {
  if (key.id === undefined || !MODIFIER_KEY_IDS.has(key.id)) return {};
  if (touchSpValue(key.sp) === 9) return {};
  const text = (key.text ?? "").toLowerCase();
  const state = shiftStateOf(layerId);
  const want: TouchModifierKeyPatch = {};
  const opens = (family: "ctrl" | "rightalt"): string => {
    const variant = state === "default" ? undefined : keymanModifierLayerId([family, state]);
    return variant !== undefined && layerIds.has(variant) ? variant : family;
  };
  const home = state; // the non-modifier layer of the same shift state

  if (text === "ctrl") {
    want.text = "*Ctrl*";
    if (isCtrlLayer(layerId)) {
      want.sp = 2;
      want.nextlayer = home;
    } else {
      want.nextlayer = opens("ctrl");
    }
  } else if (text === "*alt*" || text === "ralt" || text === "rightalt") {
    want.id = "K_RALT";
    want.text = "*RAlt*";
    if (isRaltLayer(layerId)) {
      want.sp = 2;
      want.nextlayer = home;
    } else if (layerId === "shift" || layerId === "caps") {
      want.nextlayer = opens("rightalt");
    }
  } else if (text === "default") {
    if (isRaltLayer(layerId)) {
      want.id = "K_RALT";
      want.sp = 2;
      want.text = "*RAlt*";
    } else if (isCtrlLayer(layerId)) {
      want.sp = 2;
      want.text = "*Ctrl*";
    } else if (layerId === "shift" || layerId === "caps") {
      want.id = "K_RALT";
      want.text = "*RAlt*";
      want.nextlayer = opens("rightalt");
    }
  } else if (["s-alt", "s alt", "shift alt", "shift-ralt"].includes(text)) {
    want.id = "K_RALT";
    want.text = "*RAlt*";
    if (isRaltLayer(layerId)) {
      want.sp = 2;
      want.nextlayer = home;
    }
  }

  const patch: TouchModifierKeyPatch = {};
  if (want.id !== undefined && want.id !== key.id) patch.id = want.id;
  if (want.text !== undefined && want.text !== key.text) patch.text = want.text;
  if (want.sp !== undefined && want.sp !== touchSpValue(key.sp)) patch.sp = want.sp;
  if (want.nextlayer !== undefined && want.nextlayer !== (key.nextlayer ?? undefined)) {
    patch.nextlayer = want.nextlayer;
  }
  return patch;
}
