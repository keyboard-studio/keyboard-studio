// The starting point's copyright holder name(s), as the selector under the
// il_copyright_holder text box offers them.
//
// Each entry is a `CopyrightHolder.name` — the exact string the D4 dedupe keys
// on — so recording one verbatim collapses into the inherited notice instead of
// emitting a second line for the same holder (`SIL␣␣International` hazard).
//
// Source order mirrors the emission path: `resolveInheritedHolders` (LICENSE.md
// is authoritative, D4; the D5 override counts) and, only when that yields
// nothing, the starting keyboard's `&COPYRIGHT` header parsed the same way.

import { parseCopyright } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { resolveInheritedHolders } from "@keyboard-studio/engine";

export function startCopyrightHolders(
  startLicenseText: string | null | undefined,
  startHolderOverride: string | null | undefined,
  startIr: KeyboardIR | null | undefined,
): string[] {
  const names: string[] = [];
  const add = (name: string): void => {
    if (name !== "" && !names.includes(name)) names.push(name);
  };
  for (const h of resolveInheritedHolders(
    startLicenseText ?? undefined,
    startHolderOverride ?? undefined,
  ).inherited) {
    add(h.name);
  }
  if (names.length === 0) {
    const header = startIr?.header.copyright;
    if (header !== undefined && header !== "") {
      // The &COPYRIGHT header usually omits the leading word the parser keys on.
      const parsed = parseCopyright(/^\s*copyright\b/i.test(header) ? header : `Copyright ${header}`);
      if (parsed.ok) for (const h of parsed.block) add(h.name);
    }
  }
  return names;
}
