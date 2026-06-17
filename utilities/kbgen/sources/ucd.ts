// Adapter over the vendored UnicodeData.txt (UAX #44). Gives the engine character
// NAMES and canonical decompositions for ANY codepoint -- this is what lets the name
// parser ("LATIN SMALL LETTER B WITH HOOK" -> B) generalize past the curated set.
//
// Lazily parsed on first use. If the file has not been fetched (run fetch-data.ts),
// every accessor returns null and callers fall back to the offline supplement.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILE = path.join(__dirname, '..', 'data', 'unicode', 'UnicodeData.txt');

interface UcdEntry {
  name: string;
  gc: string;
  decomp: number[] | null;
}

let MAP: Map<number, UcdEntry> | null = null; // int codepoint -> { name, gc, decomp:[int]|null }

function load(): Map<number, UcdEntry> {
  if (MAP !== null) return MAP;
  MAP = new Map();
  let text: string;
  try { text = fs.readFileSync(FILE, 'utf8'); } catch { return MAP; }
  for (const line of text.split('\n')) {
    if (!line) continue;
    const f = line.split(';');
    const code = parseInt(f[0], 16);
    // Canonical decomposition only (skip <compat>, <font>, ... tagged forms).
    let decomp: number[] | null = null;
    if (f[5] && !f[5].startsWith('<')) {
      decomp = f[5].trim().split(/\s+/).map((h) => parseInt(h, 16));
    }
    MAP.set(code, { name: f[1], gc: f[2], decomp });
  }
  return MAP;
}

const cpOf = (ch: string) => ch.codePointAt(0) as number;
export const available = () => load().size > 0;
export const nameOf = (ch: string): string | null => { const e = load().get(cpOf(ch)); return e ? e.name : null; };
export const gcOf = (ch: string): string | null => { const e = load().get(cpOf(ch)); return e ? e.gc : null; };
export const decompOf = (ch: string): number[] | null => { const e = load().get(cpOf(ch)); return e && e.decomp ? e.decomp : null; };
