// Tests for referenceHostLayouts.ts (spec 076 FR-023, A3/A3.1).

import { describe, it, expect } from 'vitest';
import {
  REFERENCE_DATA_VERSION,
  REGION_LAYOUT_MAPPING_VERSION,
  REFERENCE_HOST_IDS,
  HOST_LAYOUTS,
  DEADKEY,
  lookupHostOutput,
  likelyHostLayouts,
  canonicalHostLayer,
  HOST_GUESS_CAPTION,
  BLOCKED_HOST_ID,
} from './referenceHostLayouts.ts';

describe('reference host data', () => {
  it('is versioned (data and region mapping)', () => {
    expect(REFERENCE_DATA_VERSION).toBeGreaterThanOrEqual(1);
    expect(REGION_LAYOUT_MAPPING_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('covers exactly the five FR-023 reference hosts', () => {
    expect([...REFERENCE_HOST_IDS]).toEqual(['us', 'us-intl', 'azerty', 'qwertz', 'uk']);
    for (const id of REFERENCE_HOST_IDS) {
      expect(HOST_LAYOUTS[id].id).toBe(id);
      expect(HOST_LAYOUTS[id].label.length).toBeGreaterThan(0);
    }
  });

  it('UK English AltGr+4 leaks € (the A3 motivating example)', () => {
    expect(lookupHostOutput('uk', 'K_4', ['RALT'])).toBe('€');
    // Chirality-insensitive: RIGHTALT is the same physical key.
    expect(lookupHostOutput('uk', 'K_4', ['RIGHTALT'])).toBe('€');
    // Ctrl+Alt is AltGr on Windows.
    expect(lookupHostOutput('uk', 'K_4', ['CTRL', 'LALT'])).toBe('€');
  });

  it('German QWERTZ AltGr+E leaks € (the A3 uniformity example)', () => {
    expect(lookupHostOutput('qwertz', 'K_E', ['RALT'])).toBe('€');
  });

  it('marks host deadkeys with the DEADKEY sentinel, not a character', () => {
    expect(lookupHostOutput('us-intl', 'K_QUOTE', [])).toBe(DEADKEY);
    expect(lookupHostOutput('us-intl', 'K_BKQUOTE', [])).toBe(DEADKEY);
    expect(lookupHostOutput('qwertz', 'K_BKQUOTE', [])).toBe(DEADKEY);
  });

  it('returns undefined for uncovered cells — never a guess', () => {
    // Plain US has no AltGr layer.
    expect(lookupHostOutput('us', 'K_A', ['RALT'])).toBeUndefined();
    // Shift+AltGr is its own layer; Windows UK defines nothing on Shift+AltGr+4.
    expect(lookupHostOutput('uk', 'K_4', ['SHIFT', 'RALT'])).toBeUndefined();
  });

  it('maps the Shift+AltGr layer separately from AltGr', () => {
    expect(lookupHostOutput('uk', 'K_A', ['SHIFT', 'RALT'])).toBe('Á');
    expect(lookupHostOutput('uk', 'K_A', ['RALT'])).toBe('á');
  });

  it('matches Windows on the cells hand curation got wrong (basic keyboards are the source)', () => {
    // Windows UK has no AltGr bracket series, backslash on AltGr+hyphen, or ß/µ/ç.
    for (const key of ['K_7', 'K_8', 'K_9', 'K_0', 'K_HYPHEN', 'K_S', 'K_M', 'K_C']) {
      expect(lookupHostOutput('uk', key, ['RALT'])).toBeUndefined();
    }
    expect(lookupHostOutput('uk', 'K_BKQUOTE', ['RALT'])).toBe('¦');
    expect(lookupHostOutput('us-intl', 'K_Y', ['RALT'])).toBe('ü');
    // French AZERTY AltGr+2 (~) and AltGr+7 (`) are deadkeys, not literals.
    expect(lookupHostOutput('azerty', 'K_2', ['RALT'])).toBe(DEADKEY);
    expect(lookupHostOutput('azerty', 'K_7', ['RALT'])).toBe(DEADKEY);
  });

  it("normalizes Keyman's K_oE2 spelling to the tables' upper-cased ids", () => {
    expect(lookupHostOutput('qwertz', 'K_oE2', [])).toBe(lookupHostOutput('qwertz', 'K_OE2', []));
    expect(lookupHostOutput('qwertz', 'K_oE2', [])).toBe('<');
  });
});

describe('lookupHostOutput on multiple layouts', () => {
  it('US base layer', () => {
    expect(lookupHostOutput('us', 'K_A', [])).toBe('a');
    expect(lookupHostOutput('us', 'K_1', ['SHIFT'])).toBe('!');
  });

  it('AZERTY base layer differs positionally from US', () => {
    // K_A is positional (US-named): on AZERTY it produces q.
    expect(lookupHostOutput('azerty', 'K_A', [])).toBe('q');
    expect(lookupHostOutput('azerty', 'K_Q', [])).toBe('a');
    // Digits live on shift.
    expect(lookupHostOutput('azerty', 'K_1', [])).toBe('&');
    expect(lookupHostOutput('azerty', 'K_1', ['SHIFT'])).toBe('1');
  });

  it('QWERTZ swaps Y and Z positionally', () => {
    expect(lookupHostOutput('qwertz', 'K_Z', [])).toBe('y');
    expect(lookupHostOutput('qwertz', 'K_Y', [])).toBe('z');
  });

  it('UK shift layer carries £ on Shift+3', () => {
    expect(lookupHostOutput('uk', 'K_3', ['SHIFT'])).toBe('£');
    expect(lookupHostOutput('us', 'K_3', ['SHIFT'])).toBe('#');
  });
});

describe('canonicalHostLayer', () => {
  it('classifies base / shift / altgr', () => {
    expect(canonicalHostLayer([])).toBe('base');
    expect(canonicalHostLayer(['SHIFT'])).toBe('shift');
    expect(canonicalHostLayer(['RSHIFT'])).toBe('shift');
    expect(canonicalHostLayer(['RALT'])).toBe('altgr');
    expect(canonicalHostLayer(['RIGHTALT'])).toBe('altgr');
    expect(canonicalHostLayer(['CTRL', 'LALT'])).toBe('altgr');
  });
});

describe('likelyHostLayouts resolution order (FR-023 / A3.1)', () => {
  it("the author's layout_family answer beats bcp47", () => {
    expect(likelyHostLayouts(['en-US'], 'qwertz')).toEqual(['qwertz']);
    expect(likelyHostLayouts(['de-DE'], 'azerty')).toEqual(['azerty']);
  });

  it('a coarse qwerty answer is refined by bcp47 region (qwerty + en-GB → UK English)', () => {
    expect(likelyHostLayouts(['en-GB'], 'qwerty')).toEqual(['uk']);
    expect(likelyHostLayouts(['en-US'], 'qwerty')).toEqual(['us']);
    // A region that contradicts the answered family does NOT override it.
    expect(likelyHostLayouts(['de-DE'], 'qwerty')).toEqual(['us']);
  });

  it('bcp47 region mapping applies when the question is unanswered', () => {
    expect(likelyHostLayouts(['de-DE'])).toEqual(['qwertz']);
    expect(likelyHostLayouts(['fr-FR'])).toEqual(['azerty']);
    expect(likelyHostLayouts(['en-GB'])).toEqual(['uk']);
    expect(likelyHostLayouts(['en-CA'])).toEqual(['us']);
    expect(likelyHostLayouts(['en-US'])).toEqual(['us']);
  });

  it('fr-CA gets no region answer: CSA is not in the reference set, so it falls back to all five rather than a wrong US', () => {
    expect(likelyHostLayouts(['fr-CA'])).toEqual([...REFERENCE_HOST_IDS]);
  });

  it('no signal → all five reference hosts', () => {
    expect(likelyHostLayouts([])).toEqual(['us', 'us-intl', 'azerty', 'qwertz', 'uk']);
    expect(likelyHostLayouts([], undefined)).toEqual([...REFERENCE_HOST_IDS]);
    // Unknown regions are no signal.
    expect(likelyHostLayouts(['xx-YY'])).toEqual([...REFERENCE_HOST_IDS]);
  });

  it('multiple tags union in first-seen order', () => {
    expect(likelyHostLayouts(['de-DE', 'fr-FR'])).toEqual(['qwertz', 'azerty']);
  });
});

describe('shared selector constants', () => {
  it('exposes the honesty caption and the blocked entry id', () => {
    expect(HOST_GUESS_CAPTION).toMatch(/best guess/);
    expect(HOST_GUESS_CAPTION).toMatch(/not sight of them/);
    expect(BLOCKED_HOST_ID).toBe('blocked');
  });
});
