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
'use strict';

const fs = require('fs');
const { keyForChar } = require('./layout');

const isAsciiLetter = (s) => typeof s === 'string' && s.length === 1 && /[A-Za-z]/.test(s);
const isSpecial = (s) => typeof s === 'string' && [...s].length === 1 && s.codePointAt(0) > 0x7F && /\p{L}/u.test(s);

function extractCorpus(touchFile, layout) {
  const j = JSON.parse(fs.readFileSync(touchFile, 'utf8'));
  const found = new Map(); // char -> { key, mechanism, restore }
  for (const plat of Object.values(j)) {
    for (const l of plat.layer || []) {
      for (const row of l.row || []) {
        for (const k of row.key || []) {
          // Special sitting on a base slot: restore subkey identifies the displaced key.
          if (isSpecial(k.text)) {
            const restore = (k.sk || []).map((s) => s.text).find(isAsciiLetter);
            const host = restore ? keyForChar(layout, restore) : null;
            if (!found.has(k.text)) found.set(k.text, { key: host ? host.key : null, mechanism: 'swap', restore: restore || null });
          }
          // Special as a longpress on an ASCII host key.
          for (const s of k.sk || []) {
            if (isSpecial(s.text) && /^K_/.test(k.id)) {
              if (!found.has(s.text)) found.set(s.text, { key: k.id, mechanism: 'longpress', restore: null });
            }
          }
        }
      }
    }
  }
  return found;
}

// Compare engine placements (from place.plan) against the corpus extraction.
function diff(placements, corpus) {
  const rows = [];
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

module.exports = { extractCorpus, diff };
