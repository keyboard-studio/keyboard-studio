// hoverInfoStore — Ableton-style global hover/focus info model.
//
// A single store shared by all writers (Rail nodes, GlyphCells, toolbar controls).
// InfoView is the ONLY subscriber of `s.info`.
// Writers select only the stable `setInfo`/`clearInfo` actions so they never
// re-render on info changes.

import { create } from 'zustand';
import type { CarveNode, HoverGlyph } from '../lib/irToCarveNodes.ts';

export type HoverInfo =
  | { kind: 'node'; node: CarveNode }
  | ({ kind: 'key' } & HoverGlyph)
  | { kind: 'text'; title: string; body: string };

interface HoverInfoState {
  info: HoverInfo | null;
  setInfo: (info: HoverInfo) => void;
  clearInfo: () => void;
}

export const useHoverInfoStore = create<HoverInfoState>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
  clearInfo: () => set({ info: null }),
}));
