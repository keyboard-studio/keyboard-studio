// Stages 4-5: decide a placement MECHANISM for every character, then prove the result
// is lossless (every base character still reachable).
//
// Policy (logic-driven, not convenience-driven):
//   * The anchor key comes from analyze.js -- it is the visually/phonetically related
//     key, NOT an arbitrary unused key. ɓ goes on B, never on a random free V.
//   * If that anchor key is FREE in this orthography, remap it directly (fast to type,
//     and still the logical key) and restore the displaced letter on the RALT layer.
//   * If the anchor key is OCCUPIED (its letter is used by the language), place the
//     special on RALT+anchor so the base letter is never overwritten.
//   * --free-swap relocates an occupied-anchor special onto the nearest free key with a
//     restore (the "swap v for ɓ" convenience route). OFF by default; exposed for the
//     future interactive tool, since it trades logical consistency for typing speed.
//
// Touch placement mirrors desktop: a direct remap shows the special on its slot with a
// longpress to restore the original; an RALT placement becomes a longpress of the
// special on the (unchanged) anchor key.
'use strict';

const { analyzeChar, scoreAnchors } = require('./analyze');

const hex = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

// Build the placement plan for a character inventory.
//   chars   : array of special output characters (e.g. ['ɓ','Ɓ','ɗ','Ɗ',...])
//   layout  : indexed base layout from layout.getLayout()
//   free    : Set of free key ids from analyze.availability()
//   opts    : { freeSwap:false }
function plan(chars, layout, free, opts = {}) {
  const warnings = [];
  const unplaced = [];
  // Per-key plan. Defaults: the key keeps its base letter on both layers.
  const keys = new Map();
  const keyPlan = (id) => {
    if (!keys.has(id)) {
      const k = layout.byKey.get(id);
      keys.set(id, {
        key: id, baseLower: k.lower, baseUpper: k.upper,
        defOut: null, shiftOut: null,                 // direct remap outputs (null = keep base)
        raltDef: null, raltShift: null,               // RALT layer outputs
        skDef: [], skShift: [],                        // touch longpress subkeys (chars)
        displaced: false,
      });
    }
    return keys.get(id);
  };

  // Track which (key, case, channel) slots are taken so collisions are caught.
  const taken = new Set();
  const placements = [];

  // Sort by anchor confidence so the strongest signal claims a key first. The anchor is
  // resolved from the CASE-FOLDED (lowercase) form so a case pair always shares one key:
  // e.g. ɣ has a confusables.txt entry (->y) but Ɣ does not, and we must not split them.
  const ranked = chars.map((ch) => {
    const f = analyzeChar(ch);
    const fold = ch.toLowerCase();
    const anchorFeature = fold !== ch ? analyzeChar(fold) : f;
    const anchors = scoreAnchors(anchorFeature, layout);
    return { ch, f, anchor: anchors[0] || null, anchors };
  }).sort((a, b) => (b.anchor ? b.anchor.weight : 0) - (a.anchor ? a.anchor.weight : 0));

  for (const item of ranked) {
    const { ch, f, anchor } = item;
    if (!anchor) {
      unplaced.push({ ch, reason: 'no anchor signal (name/decomposition/confusable/phonetic all failed)' });
      warnings.push(`No anchor for ${ch} (${f.code}) -- add a visual/ipa hint in data/supplement.json, or place it manually`);
      continue;
    }
    const upper = f.upper === true;
    let anchorKey = anchor.key;
    let mechanism;

    const isFree = free.has(anchorKey);
    if (!isFree && opts.freeSwap) {
      // Convenience route: move to the nearest unclaimed free key instead of using RALT.
      const alt = [...free].find((id) => !taken.has(`${id}|direct|${upper}`));
      if (alt) { anchorKey = alt; }
    }

    const directSlot = `${anchorKey}|direct|${upper}`;
    const raltSlot = `${anchorKey}|ralt|${upper}`;
    const kp = keyPlan(anchorKey);

    if (free.has(anchorKey) || (opts.freeSwap && anchorKey !== anchor.key)) {
      // Direct remap on a free key. Restore the displaced original on RALT.
      if (taken.has(directSlot)) { mechanism = 'ralt'; }
      else {
        mechanism = 'direct';
        taken.add(directSlot);
        if (upper) { kp.shiftOut = ch; if (kp.raltShift == null) kp.raltShift = kp.baseUpper; }
        else { kp.defOut = ch; if (kp.raltDef == null) kp.raltDef = kp.baseLower; }
        kp.displaced = true;
        // Touch: special occupies the slot, original becomes the longpress.
        (upper ? kp.skShift : kp.skDef).push(upper ? kp.baseUpper : kp.baseLower);
      }
    } else {
      mechanism = 'ralt';
    }

    if (mechanism === 'ralt') {
      if (taken.has(raltSlot)) {
        unplaced.push({ ch, reason: `RALT+${anchorKey} already used (anchor collision)` });
        warnings.push(`Collision: ${ch} (${f.code}) and another char both want RALT+${anchorKey}`);
        continue;
      }
      taken.add(raltSlot);
      if (upper) kp.raltShift = ch; else kp.raltDef = ch;
      // Touch: longpress the special on the unchanged anchor key.
      (upper ? kp.skShift : kp.skDef).push(ch);
    }

    placements.push({ ch, code: hex(ch), upper, anchorKey, baseAnchorKey: anchor.key,
                      via: anchor.via, weight: anchor.weight, mechanism });
  }

  return { keys, placements, warnings, unplaced };
}

// Stage 5: completeness invariant -- every base character must still be typeable, and
// every requested special must be reachable on a hardware-key path (base or RALT).
function checkComplete(planResult, layout, requestedChars) {
  const reachable = new Set();
  for (const k of layout.keys) {
    const kp = planResult.keys.get(k.key);
    // Base layer output (special if directly remapped, else the original letter).
    reachable.add(kp && kp.defOut != null ? kp.defOut : k.lower);
    reachable.add(kp && kp.shiftOut != null ? kp.shiftOut : k.upper);
    if (kp) {
      if (kp.raltDef != null) reachable.add(kp.raltDef);
      if (kp.raltShift != null) reachable.add(kp.raltShift);
    }
  }
  const missingBase = [];
  for (const k of layout.keys) {
    if (!reachable.has(k.lower)) missingBase.push(k.lower);
    if (!reachable.has(k.upper)) missingBase.push(k.upper);
  }
  const missingSpecial = [];
  for (const ch of requestedChars) {
    if (!reachable.has(ch)) missingSpecial.push(ch);
  }
  return {
    complete: missingBase.length === 0 && missingSpecial.length === 0,
    missingBase,
    missingSpecial,
  };
}

module.exports = { plan, checkComplete };
