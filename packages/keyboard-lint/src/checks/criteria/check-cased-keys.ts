// Check 7.28 — KM_LINT_CASEDKEYS_MISSING.
//
// A keyboard for a cased script must declare store(&CasedKeys), so Caps
// Lock shifts its letter keys (Keyman 14+). Without it, Caps Lock either
// does nothing or depends on per-key CAPS/NCAPS rules — the legacy
// pattern the scaffolder strips from new keyboards (scaffold-ir.ts
// stripCapsRules + ensureCasedKeysStore).
//
// "Cased script" is read from the keyboard itself: it produces at least
// one letter with distinct upper and lower case forms. Mnemonic layouts
// are exempt — kmc rejects &CasedKeys alongside &MNEMONICLAYOUT.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

function systemStoreValue(ir: KeyboardIR, name: string): string | undefined {
  const store = ir.stores.find(
    (s) => s.isSystem && s.name.toUpperCase() === name,
  );
  if (store === undefined) return undefined;
  return store.items
    .map((item) =>
      item.kind === "char" ? item.value : item.kind === "raw" ? item.text : "",
    )
    .join("")
    .trim();
}

/** 7.28 — a cased-script keyboard declares store(&CasedKeys). */
export function checkCasedKeysDeclared(
  ir: KeyboardIR,
  keyboardId: string,
): CheckResult {
  if (systemStoreValue(ir, "CASEDKEYS") !== undefined) {
    return checkPassed("KM_LINT_CASEDKEYS_MISSING", ["store(&CasedKeys) is declared."]);
  }
  if (/^['"]?1['"]?$/.test(systemStoreValue(ir, "MNEMONICLAYOUT") ?? "")) {
    return checkPassed("KM_LINT_CASEDKEYS_MISSING", [
      "Mnemonic layout: &CasedKeys does not apply.",
    ]);
  }
  const cased = [...buildProducedSet(ir)].find((glyph) =>
    [...glyph].some((ch) => ch.toLowerCase() !== ch.toUpperCase()),
  );
  if (cased === undefined) {
    return checkPassed("KM_LINT_CASEDKEYS_MISSING", [
      "No cased letters produced: &CasedKeys does not apply.",
    ]);
  }
  return checkFailed("KM_LINT_CASEDKEYS_MISSING", [
    criteriaFinding({
      code: "KM_LINT_CASEDKEYS_MISSING",
      file: kmnPath(keyboardId),
      message: `The keyboard produces cased letters (e.g. "${cased}") but does not declare store(&CasedKeys), so Caps Lock will not shift its letter keys.`,
      hint: "Add store(&CasedKeys) listing the letter keys (e.g. [K_A] .. [K_Z]), raise &VERSION to at least 14.0, and remove any CAPS/NCAPS rules it replaces.",
    }),
  ]);
}
