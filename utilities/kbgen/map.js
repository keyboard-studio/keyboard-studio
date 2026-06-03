// Build the explicit PLACEMENT MAPPING: for every character, which key and which method
// it uses on the PHYSICAL (hardware) keyboard and on the TOUCH keyboard. This is the
// hand-off artifact -- a downstream process turns it into source files and compiles.
//
// Methods
//   physical:  direct    plain key remap (special replaces the base letter on that key)
//              modifier  RALT (+SHIFT) + anchor key  (base letter untouched)
//              restore   RALT (+SHIFT) + key -> the base letter a direct remap displaced
//   touch:     base      special occupies the key's slot; its longpress restores the base
//              longpress special is a longpress (subkey) on the unchanged base key
'use strict';

const mods = (shift, ralt) => [...(shift ? ['SHIFT'] : []), ...(ralt ? ['RALT'] : [])];

function build(planResult, layout, ctx) {
  const physical = [];
  const touch = [];

  for (const p of planResult.placements) {
    const pos = layout.byKey.get(p.anchorKey);
    const anchor = { via: p.via, weight: p.weight, baseChar: pos ? (p.upper ? pos.upper : pos.lower) : null };

    if (p.mechanism === 'direct') {
      physical.push({
        char: p.ch, codepoint: p.code, key: p.anchorKey, shift: p.upper,
        method: 'direct', modifiers: mods(p.upper, false), output: p.ch,
        displaces: anchor.baseChar, anchor,
      });
      touch.push({
        char: p.ch, codepoint: p.code, key: p.anchorKey,
        layer: p.upper ? 'shift' : 'default', method: 'base',
        position: pos ? { row: pos.row, col: pos.col } : null,
        host: anchor.baseChar, anchor,
      });
    } else { // modifier (RALT)
      physical.push({
        char: p.ch, codepoint: p.code, key: p.anchorKey, shift: p.upper,
        method: 'modifier', modifiers: mods(p.upper, true), output: p.ch,
        displaces: null, anchor,
      });
      touch.push({
        char: p.ch, codepoint: p.code, key: p.anchorKey,
        layer: p.upper ? 'shift' : 'default', method: 'longpress',
        position: pos ? { row: pos.row, col: pos.col } : null,
        host: anchor.baseChar, anchor,
      });
    }
  }

  // Restores: base letters that a direct remap pushed onto the RALT layer.
  for (const k of layout.keys) {
    const kp = planResult.keys.get(k.key);
    if (!kp) continue;
    if (kp.defOut != null) physical.push({
      char: k.lower, codepoint: 'U+' + k.lower.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
      key: k.key, shift: false, method: 'restore', modifiers: mods(false, true), output: k.lower,
      restoreOf: kp.defOut,
    });
    if (kp.shiftOut != null) physical.push({
      char: k.upper, codepoint: 'U+' + k.upper.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
      key: k.key, shift: true, method: 'restore', modifiers: mods(true, true), output: k.upper,
      restoreOf: kp.shiftOut,
    });
  }

  return {
    keyboard: { id: ctx.id, name: ctx.name },
    base: { id: layout.id, name: layout.name },
    source: ctx.source || {},
    freeKeys: ctx.freeKeys || [],
    summary: {
      specials: planResult.placements.length,
      physicalEntries: physical.length,
      touchEntries: touch.length,
      unplaced: planResult.unplaced.length,
    },
    physical,
    touch,
    completeness: ctx.completeness,
    unplaced: planResult.unplaced,
    warnings: planResult.warnings,
  };
}

// Two-column human summary for the console.
function format(map) {
  const L = [];
  L.push(`\n${map.keyboard.name}  (base ${map.base.name}; free keys: ${map.freeKeys.join(' ') || '(none)'})`);
  if (map.source.locale || map.source.unicodeVersion) {
    L.push(`source: locale=${map.source.locale || '-'}  unicode=${map.source.unicodeVersion || '-'}  cldr=${map.source.cldrVersion || '-'}`);
  }
  L.push('\nPHYSICAL keyboard');
  L.push('  output  keys                method     anchor');
  for (const e of map.physical) {
    const combo = [...e.modifiers, e.key].join('+');
    const why = e.method === 'restore' ? `restores, displaced by ${e.restoreOf}` : `${e.anchor.via} (${e.anchor.weight})`;
    L.push(`   ${e.char}      ${combo.padEnd(18)} ${e.method.padEnd(9)} ${why}`);
  }
  L.push('\nTOUCH keyboard');
  L.push('  output  key      layer    method     host  anchor');
  for (const e of map.touch) {
    L.push(`   ${e.char}      ${e.key.padEnd(8)} ${e.layer.padEnd(8)} ${e.method.padEnd(9)} ${(e.host || '').padEnd(5)} ${e.anchor.via}`);
  }
  if (map.unplaced.length) {
    L.push('\nUNPLACED (need a manual decision):');
    for (const u of map.unplaced) L.push(`   ${u.ch}  -- ${u.reason}`);
  }
  if (map.warnings.length) { L.push('\nWarnings:'); for (const w of map.warnings) L.push('   ! ' + w); }
  const unplacedNote = map.unplaced.length ? `  (${map.unplaced.length} special left unplaced -- see above)` : '';
  L.push(`\nCompleteness: ${map.completeness.complete ? 'OK -- every base character still reachable' : 'FAIL'}${unplacedNote}`);
  if (!map.completeness.complete) {
    if (map.completeness.missingBase.length) L.push('   missing base: ' + map.completeness.missingBase.join(' '));
    if (map.completeness.missingSpecial.length) L.push('   missing special: ' + map.completeness.missingSpecial.join(' '));
  }
  return L.join('\n');
}

module.exports = { build, format };
