// Builders for TouchLayoutIR values in the LDML export suites (spec 108 Story 4).
import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";

let counter = 0;

export function key(id: string, extra: Partial<TouchKeyIR> = {}): TouchKeyIR {
  counter += 1;
  return { nodeId: `n${counter}`, id, ...extra };
}

export type Layers = Record<string, TouchKeyIR[][]>;

export function platform(id: "phone" | "tablet" | "desktop", layers: Layers, extra: Partial<TouchLayoutIR["platforms"][number]> = {}) {
  return {
    id,
    ...extra,
    layers: Object.entries(layers).map(([layerId, rows]) => ({ id: layerId, rows: rows.map((keys) => ({ keys })) })),
  };
}

export function layout(...platforms: TouchLayoutIR["platforms"]): TouchLayoutIR {
  return { platforms, nodeIds: [] } as unknown as TouchLayoutIR;
}
