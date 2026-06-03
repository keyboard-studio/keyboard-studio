// Adapter over the vendored UnicodeData.txt (UAX #44). Gives the engine character
// NAMES and canonical decompositions for ANY codepoint -- this is what lets the name
// parser ("LATIN SMALL LETTER B WITH HOOK" -> B) generalize past the curated set.
//
// Lazily parsed on first use. If the file has not been fetched (run fetch-data.js),
// every accessor returns null and callers fall back to the offline supplement.
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'unicode', 'UnicodeData.txt');
let MAP = null; // int codepoint -> { name, gc, decomp:[int]|null }

function load() {
  if (MAP !== null) return MAP;
  MAP = new Map();
  let text;
  try { text = fs.readFileSync(FILE, 'utf8'); } catch { return MAP; }
  for (const line of text.split('\n')) {
    if (!line) continue;
    const f = line.split(';');
    const code = parseInt(f[0], 16);
    // Canonical decomposition only (skip <compat>, <font>, ... tagged forms).
    let decomp = null;
    if (f[5] && !f[5].startsWith('<')) {
      decomp = f[5].trim().split(/\s+/).map((h) => parseInt(h, 16));
    }
    MAP.set(code, { name: f[1], gc: f[2], decomp });
  }
  return MAP;
}

const cpOf = (ch) => ch.codePointAt(0);
const available = () => load().size > 0;
const nameOf = (ch) => { const e = load().get(cpOf(ch)); return e ? e.name : null; };
const gcOf = (ch) => { const e = load().get(cpOf(ch)); return e ? e.gc : null; };
const decompOf = (ch) => { const e = load().get(cpOf(ch)); return e && e.decomp ? e.decomp : null; };

module.exports = { available, nameOf, gcOf, decompOf };
