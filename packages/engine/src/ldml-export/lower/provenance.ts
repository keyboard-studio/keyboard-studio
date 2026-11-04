// Per-position provenance record (FR-028; task T090).
//
// Built from baseFill's grid: every main-block position of every hardware layer, once, as
// authored, filled or suppressed, in sorted order. The record goes to the report. It is not
// written into the document: the CLDR 46 and 49 schemas reject a foreign-namespace child of
// `<special>` (research R32, T089), so row 4.17 is a Keyman/TR35 gap and the record is
// report-only. `toSpecialElement` is kept so a later profile can write it once a schema admits it.

import type { LdmlSpecial } from "../xml/model.js";
import type { Grid, Provenance } from "./baseFill.js";
import { compareCodePoints } from "./keyIds.js";

export interface PositionProvenance {
  /** The hardware layer's modifiers, e.g. `none` or `shift caps`. */
  layer: string;
  vkey: string;
  provenance: Provenance;
}

export interface ProvenanceRecord {
  baseKeyboard: { id: string; source: string };
  positions: PositionProvenance[];
}

export const PROVENANCE_NAMESPACE = "https://keyboard-studio.github.io/ns/ldml-export/1";

export function buildProvenance(grid: Grid, base: { id: string; source: string }): ProvenanceRecord {
  const positions: PositionProvenance[] = [];
  for (const layer of grid.layers) {
    for (const c of layer.cells) positions.push({ layer: layer.modifiers, vkey: c.vkey, provenance: c.provenance });
  }
  positions.sort((a, b) => compareCodePoints(a.layer, b.layer) || compareCodePoints(a.vkey, b.vkey));
  return { baseKeyboard: { id: base.id, source: base.source }, positions };
}

/** Per-layer counts, in layer order. */
export function provenanceCounts(record: ProvenanceRecord): { layer: string; authored: number; filled: number; suppressed: number }[] {
  const out = new Map<string, { layer: string; authored: number; filled: number; suppressed: number }>();
  for (const p of record.positions) {
    const row = out.get(p.layer) ?? { layer: p.layer, authored: 0, filled: 0, suppressed: 0 };
    row[p.provenance] += 1;
    out.set(p.layer, row);
  }
  return [...out.values()];
}

/** The `<special>` element for a profile whose schema admits it; unused in profiles 46 and 49. */
export function toSpecialElement(record: ProvenanceRecord): LdmlSpecial {
  return {
    namespaces: { ks: PROVENANCE_NAMESPACE },
    elements: [
      { name: "ks:baseKeyboard", attributes: [["id", record.baseKeyboard.id], ["source", record.baseKeyboard.source]] },
      ...record.positions.map((p) => ({
        name: "ks:position",
        attributes: [["layer", p.layer], ["key", p.vkey], ["provenance", p.provenance]] as const,
      })),
    ],
  };
}
