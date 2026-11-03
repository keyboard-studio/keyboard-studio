/**
 * Generate a base KvksIR (visual keyboard) from a KeyboardIR.
 *
 * Ports the intent of TIKE's `TframeOnScreenKeyboardEditor.cmdVKImportKMXClick` /
 * `AddUnderlyingLayoutKeys` (which walks a compiled .kmx), but reads Studio's
 * KeyboardIR instead of a KMX binary.
 *
 * For each rule with a vkey in context (typically the last element):
 * - vkey name + modifiers → .kvks shift layer + vkey
 * - output chars → key label and `chars` attribute
 * - deadkey output → human-readable label (never `dk(...)`)
 *
 * Modifier mapping (IR → .kvks shift code):
 *   [] → "", ["SHIFT"] → "S", ["CTRL"] → "C", ["ALT"] → "A",
 *   combinations concatenate (e.g. ["SHIFT","CTRL"] → "SC").
 *   LCTRL/RCTRL → C, LALT/RALT → A. CAPS/NCAPS/RSHIFT map to S.
 */

import type { KeyboardIR, KvksIR, IRRule } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../shared/node-ids.js";

/** IR modifier → .kvks shift-code fragment. */
function modifierToShiftCode(mod: string): string {
  switch (mod.toUpperCase()) {
    case "SHIFT":
    case "RSHIFT":
    case "CAPS":
    case "NCAPS":
      return "S";
    case "CTRL":
    case "LCTRL":
    case "RCTRL":
      return "C";
    case "ALT":
    case "LALT":
    case "RALT":
      return "A";
    default:
      return "";
  }
}

/** Sort order for shift codes: "" first, then S, C, A, then combos. */
function shiftCodeOrder(code: string): number {
  const order = ["", "S", "C", "A", "SC", "SA", "CA", "SCA"];
  const idx = order.indexOf(code);
  return idx === -1 ? 99 : idx;
}

/**
 * Extract a human-readable label for a deadkey.
 * Never returns the raw `dk(...)` form (Matthew's ruling 2026-11-03).
 * For now: the deadkey name, capitalized. A future pass can resolve the
 * combining character from the rules that consume the deadkey.
 */
function deadkeyLabel(name: string): string {
  // Strip dk() wrapper if present (shouldn't be, but be safe).
  const clean = name.replace(/^dk\((.*)\)$/i, "$1");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Extract output text from a rule's output elements. */
function ruleOutputText(rule: IRRule): { label: string; chars?: string } | null {
  const chars: string[] = [];
  let deadkeyName: string | null = null;

  for (const el of rule.output) {
    if (el.kind === "char") {
      chars.push(el.value);
    } else if (el.kind === "deadkey") {
      deadkeyName = `deadkey${el.id}`;
    } else if (el.kind === "namedDeadkey") {
      deadkeyName = el.name;
    } else if (el.kind === "nul" || el.kind === "beep") {
      // No output.
    }
    // Other kinds (context, index, outs, use) are not direct output.
  }

  if (deadkeyName) {
    return { label: deadkeyLabel(deadkeyName) };
  }
  if (chars.length > 0) {
    const text = chars.join("");
    return { label: text, chars: text };
  }
  return null;
}

/**
 * Generate a base KvksIR from a KeyboardIR.
 *
 * @param ir  The keyboard IR (rules, deadkeys).
 * @param kbdname  Keyboard name for the .kvks header.
 */
export function generateKvksFromIR(ir: KeyboardIR, kbdname: string): KvksIR {
  const minter = new NodeIdMinter();
  const layers = new Map<string, Map<string, { vkey: string; label: string; chars?: string }>>();

  // Walk all groups' rules.
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Find the vkey in context (typically last).
      const vkeyEl = [...rule.context].reverse().find((el) => el.kind === "vkey");
      if (!vkeyEl || vkeyEl.kind !== "vkey") continue;

      const shiftCode = vkeyEl.modifiers
        .map(modifierToShiftCode)
        .filter((c) => c !== "")
        .join("");
      // Dedupe: S+S → S (e.g. SHIFT+RSHIFT).
      const deduped = [...new Set(shiftCode.split(""))].join("");

      const output = ruleOutputText(rule);
      if (!output) continue;

      if (!layers.has(deduped)) {
        layers.set(deduped, new Map());
      }
      const layerKeys = layers.get(deduped)!;
      // First rule wins for a given vkey+shift (like TIKE's import).
      if (!layerKeys.has(vkeyEl.name)) {
        layerKeys.set(vkeyEl.name, {
          vkey: vkeyEl.name,
          label: output.label,
          ...(output.chars ? { chars: output.chars } : {}),
        });
      }
    }
  }

  // Sort layers by shift-code order, keys by vkey name.
  const sortedLayers = [...layers.entries()]
    .sort((a, b) => shiftCodeOrder(a[0]) - shiftCodeOrder(b[0]))
    .map(([shift, keys]) => ({
      shift,
      keys: [...keys.values()].sort((a, b) => a.vkey.localeCompare(b.vkey)),
    }));

  const nodeIds: Array<[string, { kind: "kvksKey"; nodeId: string }]> = [];
  for (const layer of sortedLayers) {
    for (const key of layer.keys) {
      nodeIds.push([`${layer.shift}:${key.vkey}`, { kind: "kvksKey", nodeId: minter.mint("kvksKey") }]);
    }
  }

  return {
    kvksVersion: "10.0",
    kbdname,
    layers: sortedLayers,
    usealtgr: false,
    nodeIds: nodeIds as KvksIR["nodeIds"],
  };
}
