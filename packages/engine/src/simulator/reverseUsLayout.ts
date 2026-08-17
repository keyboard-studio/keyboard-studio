// Reverse lookup: which physical US-layout key (+ shift state) types a given
// character. Built once, lazily, directly from the vendored engine's own
// mnemonic reverse-mapping path (`DefaultOutputRules.forAny` in mnemonic
// mode) rather than a hand-authored table, so it can never drift from what
// the simulator itself considers "the character this key produces".
//
// Used by the context-tolerance diagnostic (spec 062) to convert a rule's
// literal-character or store-content key match (`+ ']'`, `any(key.act)`) into
// an actual pressable `SimKeyInput`, since those forms only occur on mnemonic
// keyboards where the rule is written against the *character*, not the
// physical key.

import type { SimKeyInput } from '@keyboard-studio/contracts';

import { Codes } from './vendor/keyman/engine/keyboard/codes.js';
import { KeyEvent } from './vendor/keyman/engine/keyboard/keyEvent.js';
import { DefaultOutputRules } from './vendor/keyman/engine/keyboard/defaultOutputRules.js';
import { DeviceSpec } from './vendor/keyman/common/web-utils/deviceSpec.js';
// Imported for its side effect of establishing the vendor module init order
// the vendored code requires (mirrors ./index.ts's own import ordering) —
// loading defaultOutputRules.js in isolation otherwise throws at module init.
import './nodeKeyboardLoader.js';

const DEVICE = new DeviceSpec('chrome', 'desktop', 'windows', false);

let cache: Map<string, { vkey: string; shift: boolean }> | null = null;

function build(): Map<string, { vkey: string; shift: boolean }> {
  const rules = new DefaultOutputRules();
  const map = new Map<string, { vkey: string; shift: boolean }>();
  const candidates = Object.keys(Codes.keyCodes).filter(
    (name) => /^K_[A-Z0-9]+$/.test(name) && (Codes.keyCodes[name] ?? 0) < 256,
  );
  for (const name of candidates) {
    for (const shift of [false, true]) {
      const ev = new KeyEvent({
        Lcode: Codes.keyCodes[name]!,
        Lmodifiers: shift ? 0x10 : 0,
        Lstates: 0,
        LisVirtualKey: true,
        vkCode: Codes.keyCodes[name]!,
        kName: 'K_xxxx',
        device: DEVICE,
        isSynthetic: true,
        LmodifierChange: false,
      });
      const ch = rules.forAny(ev, true);
      // First writer wins so a character with multiple physical origins
      // (e.g. backslash on K_BKSLASH vs K_OE2) keeps a stable, deterministic
      // choice rather than depending on Codes.keyCodes enumeration order.
      if (ch && !map.has(ch)) map.set(ch, { vkey: name, shift });
    }
  }
  return map;
}

/**
 * The physical key (+ shift state) that types `char` under the simulator's
 * fixed `'us'` baseLayout, or `undefined` if no standard US key produces it
 * (e.g. `char` is itself a combining mark or otherwise non-typeable).
 */
export function reverseUsLayoutKey(char: string): SimKeyInput | undefined {
  cache ??= build();
  const found = cache.get(char);
  if (!found) return undefined;
  return { vkey: found.vkey, modifiers: found.shift ? ['shift'] : [] };
}
