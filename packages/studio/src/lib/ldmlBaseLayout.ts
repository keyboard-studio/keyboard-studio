// ldmlBaseLayout — resolves the ONE base keyboard the LDML export lowers against
// (spec 108 FR-027; research R26).
//
// The engine never resolves a base keyboard (it has no survey state); the studio hands it a
// finished `LdmlBaseLayout`. The choice is shown to the author, never silent:
//
//   1. an override the author set                       -> source "author"
//   2. the primary `windows-layout` pick                -> source "primary-pick"
//        when that layout has no reference data the default is UNAVAILABLE; it is never
//        replaced silently, so `chosen` stays null until the author picks another
//   3. no pick: the first likely host (family / region) -> source "likely-base"
//   4. no signal at all: US English                     -> source "en-US"

import type { LdmlBaseLayout, LdmlBaseLayoutId, LdmlBaseLayoutSource } from "@keyboard-studio/engine";
import { resolveLikelyBases, DEFAULT_BASE_LAYOUTS } from "../components/rules/baseLayouts.ts";
import type { LayoutFamilyAnswer } from "../components/rules/baseLayouts.ts";
import {
  BASE_LAYOUTS,
  REFERENCE_BASES,
  REFERENCE_BASE_IDS,
  type BaseLayer,
  type BaseLayoutId,
} from "./referenceBaseLayouts.ts";
import type { WindowsLayout } from "./windowsLayouts.ts";

const LAYERS: readonly BaseLayer[] = ["base", "shift", "altgr", "shiftAltgr"];

export interface LdmlBaseLayoutDefault {
  /** A reference host id, or the picked layout's catalog id when it has no reference data. */
  id: string;
  label: string;
  source: LdmlBaseLayoutSource;
  available: boolean;
}

export interface LdmlBaseLayoutOption {
  id: LdmlBaseLayoutId;
  label: string;
}

export interface LdmlBaseLayoutResolution {
  /** Null only when the default is unavailable and no override is set. */
  chosen: LdmlBaseLayout | null;
  defaultChoice: LdmlBaseLayoutDefault;
  options: LdmlBaseLayoutOption[];
}

export interface ResolveLdmlBaseLayoutInput {
  windowsLayoutPicks: readonly WindowsLayout[];
  layoutFamily: LayoutFamilyAnswer | null;
  bcp47: readonly string[];
  override: LdmlBaseLayoutId | null;
}

function familyOf(id: BaseLayoutId): LdmlBaseLayout["family"] {
  if (id === "azerty") return "AZERTY";
  if (id === "qwertz") return "QWERTZ";
  return "QWERTY";
}

/** Copies the four layers out of the reference tables; the caller may not mutate the tables. */
export function buildLdmlBaseLayout(id: BaseLayoutId, source: LdmlBaseLayoutSource): LdmlBaseLayout {
  const data = REFERENCE_BASES[id];
  const layers = {} as LdmlBaseLayout["layers"];
  let isoFamily = false;
  for (const layer of LAYERS) {
    const cells: Record<string, string> = { ...data[layer] };
    if ("K_OE2" in cells || "K_oE2" in cells) isoFamily = true;
    layers[layer] = cells;
  }
  return { id, label: BASE_LAYOUTS[id].label, source, family: familyOf(id), isoFamily, layers };
}

/** The likely-bases vocabulary spells US-International `intl`; the reference vocabulary `us-intl`. */
function toReferenceId(id: string): BaseLayoutId | undefined {
  if (id === "intl") return "us-intl";
  return (REFERENCE_BASE_IDS as readonly string[]).includes(id) ? (id as BaseLayoutId) : undefined;
}

export function resolveLdmlBaseLayout(input: ResolveLdmlBaseLayoutInput): LdmlBaseLayoutResolution {
  const options: LdmlBaseLayoutOption[] = REFERENCE_BASE_IDS.map((id) => ({
    id,
    label: BASE_LAYOUTS[id].label,
  }));

  const primary = input.windowsLayoutPicks[0];
  let defaultChoice: LdmlBaseLayoutDefault;
  let defaultHost: BaseLayoutId | null;

  if (primary !== undefined) {
    if (primary.host !== undefined) {
      defaultHost = primary.host;
      defaultChoice = {
        id: primary.host,
        label: BASE_LAYOUTS[primary.host].label,
        source: "primary-pick",
        available: true,
      };
    } else {
      defaultHost = null;
      defaultChoice = { id: primary.id, label: primary.name, source: "primary-pick", available: false };
    }
  } else {
    const likely = resolveLikelyBases({ layoutFamily: input.layoutFamily, bcp47: input.bcp47 });
    const noSignal =
      likely.length === DEFAULT_BASE_LAYOUTS.length && likely.every((id, i) => id === DEFAULT_BASE_LAYOUTS[i]);
    const first = noSignal ? undefined : toReferenceId(likely[0] ?? "");
    if (first !== undefined) {
      defaultHost = first;
      defaultChoice = { id: first, label: BASE_LAYOUTS[first].label, source: "likely-base", available: true };
    } else {
      defaultHost = "us";
      defaultChoice = { id: "us", label: BASE_LAYOUTS.us.label, source: "en-US", available: true };
    }
  }

  let chosen: LdmlBaseLayout | null = null;
  if (input.override !== null) chosen = buildLdmlBaseLayout(input.override, "author");
  else if (defaultHost !== null) chosen = buildLdmlBaseLayout(defaultHost, defaultChoice.source);

  return { chosen, defaultChoice, options };
}
