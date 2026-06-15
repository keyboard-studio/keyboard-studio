// Stage 7 (optional, NON-AUTHORITATIVE): compare the engine's placement against what an
// existing keyboard actually did. This exists only to surface divergences for the future
// interactive tool -- the corpus is explicitly NOT treated as ground truth, because many
// keyboards were laid out for the designer's convenience rather than user logic.
//
// It reads an existing .keyman-touch-layout and recovers, for each special character,
// which physical key it sits on and by what mechanism:
//   * "swap"      - the special occupies a base key slot; its longpress restores the
//                   displaced ASCII letter, which tells us which physical key it took.
//   * "longpress" - the special is a longpress subkey on an ASCII (K_*) host key.

import fs from "fs";
import type { Layout } from "./layout.js";
import { keyForChar } from "./layout.js";
import type { Placement } from "./place.js";

const isAsciiLetter = (s: string): boolean =>
  typeof s === "string" && s.length === 1 && /[A-Za-z]/.test(s);
const isSpecial = (s: string): boolean =>
  typeof s === "string" && [...s].length === 1 && (s.codePointAt(0) ?? 0) > 0x7f && /\p{L}/u.test(s);

interface CorpusEntry {
  key: string | null;
  mechanism: "swap" | "longpress";
  restore: string | null;
}

export function extractCorpus(touchFile: string, layout: Layout): Map<string, CorpusEntry> {
  const j = JSON.parse(fs.readFileSync(touchFile, "utf8")) as Record<string, unknown>;
  const found = new Map<string, CorpusEntry>();
  for (const plat of Object.values(j)) {
    if (typeof plat !== "object" || plat === null) continue;
    const platObj = plat as { layer?: { row?: { key?: { id?: string; text?: string; sk?: { text?: string; id?: string }[] }[] }[] }[] };
    for (const l of platObj.layer ?? []) {
      for (const row of l.row ?? []) {
        for (const k of row.key ?? []) {
          const kText = k.text ?? "";
          const kId = k.id ?? "";
          // Special sitting on a base slot: restore subkey identifies the displaced key.
          if (isSpecial(kText)) {
            const restore = (k.sk ?? []).map((s) => s.text ?? "").find(isAsciiLetter) ?? null;
            const host = restore ? keyForChar(layout, restore) : null;
            if (!found.has(kText)) found.set(kText, { key: host ? host.key : null, mechanism: "swap", restore });
          }
          // Special as a longpress on an ASCII host key.
          for (const s of k.sk ?? []) {
            const sText = s.text ?? "";
            if (isSpecial(sText) && /^K_/.test(kId)) {
              if (!found.has(sText)) found.set(sText, { key: kId, mechanism: "longpress", restore: null });
            }
          }
        }
      }
    }
  }
  return found;
}

export interface DiffRow {
  ch: string;
  engineKey: string;
  engineVia: string;
  engineMech?: "direct" | "ralt";
  corpusKey: string;
  corpusMech?: "swap" | "longpress";
  agree: boolean | null;
}

// Compare engine placements (from place.plan) against the corpus extraction.
export function diff(placements: Placement[], corpus: Map<string, CorpusEntry>): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const p of placements) {
    const c = corpus.get(p.ch);
    if (!c) {
      rows.push({ ch: p.ch, engineKey: p.anchorKey, engineVia: p.via, corpusKey: "(absent)", agree: null });
      continue;
    }
    rows.push({
      ch: p.ch,
      engineKey: p.anchorKey, engineVia: p.via, engineMech: p.mechanism,
      corpusKey: c.key ?? "(unknown)", corpusMech: c.mechanism,
      agree: c.key === p.anchorKey,
    });
  }
  return rows;
}
