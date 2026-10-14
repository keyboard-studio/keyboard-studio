// Checks 7.5 / 7.16 — the .kvks visual keyboard (spec 084 Batch 1).
//
//   7.5  KM_LINT_RALT_MISSING_USEALTGR — if any rule chord uses RALT
//        and a .kvks exists, the .kvks must carry the usealtgr flag
//   7.16 KM_LINT_KVKS_BLANK — the .kvks is populated, not blank (zero
//        layers, or zero keys across its layers)
//
// The KvksIR is parsed by the engine (parseKvks) and handed over via
// CriteriaLintInput — keyboard-lint never imports the engine. 7.16's
// absent-file case is deliberately NOT a finding here: a missing .kvks
// is not a blank .kvks, and the criteria assembly resolves that case
// separately (contextMissing) so the two never share a verdict.

import type {
  KeyboardIR,
  KvksIR,
  LintFinding,
} from "@keyboard-studio/contracts";
import { criteriaFinding, kmnPath } from "./_shared.js";

/** True when any rule context presses a key with the RALT modifier. */
export function irUsesRalt(ir: KeyboardIR): boolean {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (
          el.kind === "vkey" &&
          el.modifiers.some((m) => m.toUpperCase() === "RALT")
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/** 7.5 — RALT in the rules + a .kvks without usealtgr → finding. */
export function checkRaltMissingUsealtgr(
  ir: KeyboardIR,
  kvks: KvksIR | undefined,
  kvksPath: string | undefined,
): LintFinding[] {
  if (kvks === undefined || kvks.usealtgr) return [];
  if (!irUsesRalt(ir)) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_RALT_MISSING_USEALTGR",
      file: kvksPath ?? kmnPath(ir.header.keyboardId),
      message:
        "The keyboard uses RALT chords, but the .kvks does not include the usealtgr tag.",
      hint: "Add the usealtgr flag to the .kvks so the on-screen keyboard shows the AltGr layer.",
    }),
  ];
}

/**
 * 7.16 — a present .kvks with no layers, or no keys in any layer, is
 * blank. Called only when a .kvks file exists (the caller holds the
 * path): a present file that failed to parse defines no usable layers
 * either, and says so rather than passing silently.
 */
export function checkKvksBlank(
  kvks: KvksIR | undefined,
  kvksPath: string,
): LintFinding[] {
  if (kvks === undefined) {
    return [
      criteriaFinding({
        code: "KM_LINT_KVKS_BLANK",
        file: kvksPath,
        message:
          "The .kvks visual keyboard could not be parsed into any layers — it is blank or unreadable.",
        hint: "Replace the .kvks with a populated visual keyboard layout.",
      }),
    ];
  }
  const keyCount = kvks.layers.reduce((n, layer) => n + layer.keys.length, 0);
  if (kvks.layers.length > 0 && keyCount > 0) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KVKS_BLANK",
      file: kvksPath,
      message: `The .kvks visual keyboard is blank: it defines ${kvks.layers.length} layer(s) with ${keyCount} key(s) in total.`,
      hint: "Populate the .kvks with the keyboard's layers and keys, or remove the empty file.",
    }),
  ];
}
