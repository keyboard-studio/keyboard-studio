// Adapter over the vendored confusables.txt (UTS #39). Provides the objective
// "visually similar" signal for ALL scripts: each source character maps toward a
// prototype skeleton, and we follow that chain to the first base-layout ASCII letter.
//
// Note: UTS #39 scope is visual SPOOFING, so it covers e.g. ɓ→b and ɣ→y but omits
// letter-identity look-alikes like ŋ→n. Those gaps are filled by data/supplement.json.
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'unicode', 'confusables.txt');
let MAP = null; // int -> [int] prototype sequence

function load() {
  if (MAP !== null) return MAP;
  MAP = new Map();
  let text;
  try { text = fs.readFileSync(FILE, 'utf8'); } catch { return MAP; }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 2) continue;
    const src = parseInt(parts[0].trim(), 16);
    const tgt = parts[1].trim().split(/\s+/).map((h) => parseInt(h, 16)).filter((n) => !isNaN(n));
    if (!isNaN(src) && tgt.length) MAP.set(src, tgt);
  }
  return MAP;
}

const available = () => load().size > 0;
const isAsciiLetter = (cp) => (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);

// Resolve a character to the first base-layout ASCII letter reachable through its
// confusable skeleton, or null. Follows the prototype chain a few hops.
function skeletonBase(ch, depth = 0) {
  const m = load();
  const cp = ch.codePointAt(0);
  if (depth > 0 && isAsciiLetter(cp)) return String.fromCodePoint(cp);
  if (depth > 5) return null;
  const tgt = m.get(cp);
  if (!tgt) return null;
  const head = tgt[0];
  if (isAsciiLetter(head)) return String.fromCodePoint(head);
  return skeletonBase(String.fromCodePoint(head), depth + 1);
}

module.exports = { available, skeletonBase };
