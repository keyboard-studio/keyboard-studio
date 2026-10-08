import { describe, expect, it } from 'vitest';
import { US_BASE_LAYOUT } from './usBaseLayout.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `K_${c}`);
const DIGITS = '0123456789'.split('').map((c) => `K_${c}`);
const PUNCT = [
  'K_BKQUOTE', 'K_HYPHEN', 'K_EQUAL', 'K_LBRKT', 'K_RBRKT', 'K_BKSLASH',
  'K_COLON', 'K_QUOTE', 'K_COMMA', 'K_PERIOD', 'K_SLASH',
];
const PRINTABLE_KEYS = [...LETTERS, ...DIGITS, ...PUNCT];

describe('US_BASE_LAYOUT', () => {
  it('has 47 printable keys', () => {
    expect(PRINTABLE_KEYS).toHaveLength(47);
  });

  it.each(PRINTABLE_KEYS)('%s has unshifted and shifted entries', (key) => {
    expect(US_BASE_LAYOUT.has(key), `unshifted ${key}`).toBe(true);
    expect(US_BASE_LAYOUT.has(`S+${key}`), `shifted S+${key}`).toBe(true);
  });

  it.each([
    ['K_A', 'a'],
    ['S+K_A', 'A'],
    ['K_QUOTE', "'"],
    ['S+K_QUOTE', '"'],
    ['S+K_2', '@'],
    ['K_2', '2'],
  ])('%s -> %s', (key, ch) => {
    expect(US_BASE_LAYOUT.get(key)).toBe(ch);
  });

  it('contains only printable keys (plus K_SPACE), no non-printables', () => {
    const allowed = new Set([...PRINTABLE_KEYS, 'K_SPACE']);
    for (const k of US_BASE_LAYOUT.keys()) {
      const base = k.startsWith('S+') ? k.slice(2) : k;
      expect(allowed.has(base), `unexpected key ${k}`).toBe(true);
    }
    for (const v of US_BASE_LAYOUT.values()) {
      expect(v).toHaveLength(1);
      expect(v.charCodeAt(0)).toBeGreaterThanOrEqual(0x20);
    }
  });
});
