// Unit checks for the anchor cascade: each special character must resolve to the
// expected base-layout key, via the expected signal. Run: node test/anchors.test.js
'use strict';

const assert = require('assert');
const { getLayout } = require('../layout');
const { analyzeChar, scoreAnchors, parseName } = require('../analyze');
const { plan, checkComplete } = require('../place');

const layout = getLayout('us');
let pass = 0, fail = 0;
function check(desc, fn) {
  try { fn(); pass++; console.log('  ok  ' + desc); }
  catch (e) { fail++; console.log('FAIL  ' + desc + '\n        ' + e.message); }
}

// --- name parser ---
check('parseName "B WITH HOOK" -> base b, mod HOOK', () => {
  const r = parseName('LATIN SMALL LETTER B WITH HOOK');
  assert.strictEqual(r.base, 'b'); assert.ok(r.mods.includes('HOOK'));
});
check('parseName "OPEN E" -> base e', () => {
  assert.strictEqual(parseName('LATIN SMALL LETTER OPEN E').base, 'e');
});
check('parseName "ENG" -> no base letter', () => {
  assert.strictEqual(parseName('LATIN SMALL LETTER ENG').base, null);
});

// --- anchor expectations: char -> [expectedKey, expectedVia] ---
const EXPECT = {
  'ɓ': ['K_B', 'NAME'], 'Ɓ': ['K_B', 'NAME'],
  'ɗ': ['K_D', 'NAME'], 'Ɗ': ['K_D', 'NAME'],
  'ƙ': ['K_K', 'NAME'], 'Ƙ': ['K_K', 'NAME'],
  'ɛ': ['K_E', 'NAME'], 'ɔ': ['K_O', 'NAME'],
  'ʋ': ['K_V', 'NAME'], 'ɲ': ['K_N', 'NAME'],
  'ŋ': ['K_N', 'VISUAL'],              // ENG: no name base, not in confusables -> supplement
  'ʒ': ['K_Z', 'VISUAL'],              // EZH: confusable chain has no ASCII base -> supplement
  'ɣ': ['K_Y', 'CONFUSABLE'],          // GAMMA -> y via real confusables.txt skeleton
  'ə': ['K_E', 'VISUAL'],              // SCHWA: confusable -> turned-e (non-ASCII) -> supplement
};
for (const [ch, [key, via]] of Object.entries(EXPECT)) {
  check(`anchor ${ch} -> ${key} via ${via}`, () => {
    const top = scoreAnchors(analyzeChar(ch), layout)[0];
    assert.ok(top, 'no anchor found');
    assert.strictEqual(top.key, key);
    assert.strictEqual(top.via, via);
  });
}

// --- decomposition signal: precomposed accents anchor on their base letter ---
check('é (precomposed) -> K_E via DECOMPOSITION', () => {
  const top = scoreAnchors(analyzeChar('é'), layout)[0];
  assert.strictEqual(top.key, 'K_E'); assert.strictEqual(top.via, 'DECOMPOSITION');
});

// --- placement + completeness (Hausa-style inventory) ---
check('Hausa inventory places losslessly', () => {
  const chars = [...'ɓƁɗƊƙƘ'];
  const used = [..."abɓcdɗefghijkƙlmnoprstuwyz"]; // q, v, x free
  const layout2 = getLayout('us');
  const { availability } = require('../analyze');
  const free = availability(layout2, used);
  const pr = plan(chars, layout2, free, {});
  const comp = checkComplete(pr, layout2, chars);
  assert.ok(comp.complete, 'not complete: ' + JSON.stringify(comp));
  // ɓ anchors on B (occupied) -> RALT, never displaces b.
  const b = pr.placements.find((p) => p.ch === 'ɓ');
  assert.strictEqual(b.anchorKey, 'K_B');
  assert.strictEqual(b.mechanism, 'ralt');
});

// --- case pairs must share one anchor key (ɣ has a confusables entry, Ɣ does not) ---
check('case pair ɣ/Ɣ lands on the same key', () => {
  const { availability } = require('../analyze');
  const free = availability(layout, [..."abcdefghijklmnorstuwyz"]);
  const pr = plan([...'ɣƔ'], layout, free, {});
  const lo = pr.placements.find((p) => p.ch === 'ɣ');
  const up = pr.placements.find((p) => p.ch === 'Ɣ');
  assert.ok(lo && up, 'both cases placed');
  assert.strictEqual(lo.anchorKey, up.anchorKey);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
