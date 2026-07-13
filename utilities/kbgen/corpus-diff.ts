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

import fs from 'node:fs';
import { keyForChar } from './layout.ts';
import type { Layout } from './layout.ts';
import type { Placement } from './place.ts';
import { codepointOf, isAsciiLetterCp } from './analyze.ts';

const isAsciiLetter = (s: unknown): s is string => typeof s === 'string' && s.length === 1 && isAsciiLetterCp(codepointOf(s));
const isSpecial = (s: unknown): s is string => typeof s === 'string' && [...s].length === 1 && codepointOf(s) > 0x7F && /\p{L}/u.test(s);

export interface CorpusEntry {
  key: string | null;
  mechanism: 'swap' | 'longpress';
  restore: string | null;
}

export interface DiffRow {
  ch: string;
  engineKey: string;
  engineVia: string;
  engineMech?: string;
  corpusKey: string;
  corpusMech?: string;
  agree: boolean | null;
}

export function extractCorpus(touchFile: string, layout: Layout): Map<string, CorpusEntry> {
  // structure unchecked -- diagnostic-only, faithful port of corpus-diff.js
  const j = JSON.parse(fs.readFileSync(touchFile, 'utf8')) as Record<string, unknown>;
  const found = new Map<string, CorpusEntry>(); // char -> { key, mechanism, restore }
  for (const plat of Object.values(j)) {
    const p = plat as { layer?: unknown[] };
    for (const l of p.layer || []) {
      const layer = l as { row?: unknown[] };
      for (const row of layer.row || []) {
        const r = row as { key?: unknown[] };
        for (const k of r.key || []) {
          const key = k as { text?: unknown; sk?: unknown[]; id?: string };
          // Special sitting on a base slot: restore subkey identifies the displaced key.
          if (isSpecial(key.text)) {
            const restore = (key.sk || []).map((s) => (s as { text?: unknown }).text).find(isAsciiLetter) || null;
            const host = restore ? keyForChar(layout, restore) : null;
            if (!found.has(key.text)) found.set(key.text, { key: host ? host.key : null, mechanism: 'swap', restore: restore || null });
          }
          // Special as a longpress on an ASCII host key.
          for (const s of key.sk || []) {
            const sk = s as { text?: unknown };
            if (isSpecial(sk.text) && typeof key.id === 'string' && /^K_/.test(key.id)) {
              if (!found.has(sk.text)) found.set(sk.text, { key: key.id, mechanism: 'longpress', restore: null });
            }
          }
        }
      }
    }
  }
  return found;
}

// Compare engine placements (from place.plan) against the corpus extraction.
export function diff(placements: Placement[], corpus: Map<string, CorpusEntry>): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const p of placements) {
    const c = corpus.get(p.ch);
    if (!c) { rows.push({ ch: p.ch, engineKey: p.anchorKey, engineVia: p.via, corpusKey: '(absent)', agree: null }); continue; }
    rows.push({
      ch: p.ch,
      engineKey: p.anchorKey, engineVia: p.via, engineMech: p.mechanism,
      corpusKey: c.key || '(unknown)', corpusMech: c.mechanism,
      agree: c.key === p.anchorKey,
    });
  }
  return rows;
}
