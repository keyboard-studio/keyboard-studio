// Unit tests for capabilityHint() — one distinct hint per RemovalCapability value.

import { describe, it, expect } from 'vitest';
import { capabilityHint } from './capabilityHint.ts';

describe('capabilityHint — removable:simple', () => {
  it('mentions direct key-to-character rule and safe', () => {
    const hint = capabilityHint('removable:simple');
    expect(hint).toMatch(/direct key.*character/i);
    expect(hint).toMatch(/safe/i);
  });
});

describe('capabilityHint — removable:slot-fill', () => {
  it('mentions deadkey character set', () => {
    const hint = capabilityHint('removable:slot-fill');
    expect(hint).toMatch(/deadkey character set/i);
  });
  it('mentions the rest keeps working', () => {
    expect(capabilityHint('removable:slot-fill')).toMatch(/rest working/i);
  });
});

describe('capabilityHint — not-removable:opaque', () => {
  it('mentions advanced syntax', () => {
    expect(capabilityHint('not-removable:opaque')).toMatch(/advanced syntax/i);
  });
  it("mentions removing won't take effect", () => {
    expect(capabilityHint('not-removable:opaque')).toMatch(/won't take effect|wont take effect/i);
  });
});

describe('capabilityHint — not-removable:context-sensitive', () => {
  it('explains the character only appears after certain keypresses', () => {
    expect(capabilityHint('not-removable:context-sensitive')).toMatch(/after certain keys are pressed/i);
  });
  it("explains removing on its own isn't supported yet", () => {
    const hint = capabilityHint('not-removable:context-sensitive');
    expect(hint).toMatch(/on its own/i);
    expect(hint).toMatch(/isn't supported yet/i);
  });
});

describe('capabilityHint — not-removable:unknown', () => {
  it("mentions couldn't determine", () => {
    expect(capabilityHint('not-removable:unknown')).toMatch(/couldn't determine|could not determine/i);
  });
});

describe('capabilityHint distinctness', () => {
  const vals = [
    'removable:simple',
    'removable:slot-fill',
    'not-removable:opaque',
    'not-removable:context-sensitive',
    'not-removable:unknown',
  ] as const;

  it('all 5 capability values produce distinct hint strings', () => {
    const hints = vals.map((v) => capabilityHint(v));
    const unique = new Set(hints);
    expect(unique.size).toBe(5);
  });
});
