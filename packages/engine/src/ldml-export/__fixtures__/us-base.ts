// An LdmlBaseLayout built from contracts' US_BASE_LAYOUT (spec 108 T020).
import { US_BASE_LAYOUT } from "@keyboard-studio/contracts";
import type { LdmlBaseLayout } from "../types.js";

function build(): LdmlBaseLayout {
  const base: Record<string, string> = {};
  const shift: Record<string, string> = {};
  for (const [k, v] of US_BASE_LAYOUT) {
    if (k.startsWith("S+")) shift[k.slice(2)] = v;
    else base[k] = v;
  }
  return {
    id: "us",
    label: "US",
    source: "en-US",
    family: "QWERTY",
    isoFamily: false,
    layers: { base, shift, altgr: {}, shiftAltgr: {} },
  };
}

export const US_BASE: LdmlBaseLayout = build();
