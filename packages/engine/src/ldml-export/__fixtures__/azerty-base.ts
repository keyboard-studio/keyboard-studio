// An LdmlBaseLayout built at test time from the studio's generated base-layout data (spec 108 T020).
// There is one source: the JSON is read with `fs`, never captured here. Tests are excluded from the
// dependency-cruiser rules, so an engine test may read studio data.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LdmlBaseLayout, LdmlBaseLayoutId } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = resolve(here, "../../../../studio/src/lib/generated/baseLayouts.generated.json");

type HostTable = Record<"base" | "shift" | "altgr" | "shiftAltgr", Record<string, string>>;

function hostTable(id: LdmlBaseLayoutId): HostTable {
  const json = JSON.parse(readFileSync(JSON_PATH, "utf8")) as { hosts: Record<string, HostTable> };
  const t = json.hosts[id];
  if (t === undefined) throw new Error(`baseLayouts.generated.json has no host ${id}`);
  return t;
}

/** The AZERTY reference host, including its dead-key cells. */
export function buildAzertyBase(): LdmlBaseLayout {
  const t = hostTable("azerty");
  return {
    id: "azerty",
    label: "French (AZERTY)",
    source: "author",
    family: "AZERTY",
    isoFamily: "K_OE2" in t.base,
    layers: { base: { ...t.base }, shift: { ...t.shift }, altgr: { ...t.altgr }, shiftAltgr: { ...t.shiftAltgr } },
  };
}

export const AZERTY_BASE: LdmlBaseLayout = buildAzertyBase();
