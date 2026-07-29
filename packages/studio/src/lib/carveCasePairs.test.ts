// Tests for carveCasePairs.ts — cased-letter pairing in carve (spec 051, US4).
// Test surface P1..P11: specs/051-carve-orthography-trim/contracts/case-pairing.md
// P6/P9 are gallery-level (recommendedRemovalChars / CarveGallery cascade) and are
// covered elsewhere (T026-T029), not here.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { caseGroupFor, caseTrimSet } from './carveCasePairs.ts';

describe('caseGroupFor / caseTrimSet', () => {
  // P1 / P2 — turned-e / reversed-e pair, bidirectional
  it('P1: surplus turned-e (U+01DD) with produced reversed-E (U+018E) trims both, one undo entry', () => {
    const produced = new Set(['ǝ', 'Ǝ']);
    const trimSet = caseTrimSet('ǝ', produced, undefined);
    expect(trimSet).toEqual(new Set(['ǝ', 'Ǝ']));
  });

  it('P2: trimming reversed-E (U+018E) instead trims turned-e (U+01DD) with it (bidirectional)', () => {
    const produced = new Set(['ǝ', 'Ǝ']);
    const trimSet = caseTrimSet('Ǝ', produced, undefined);
    expect(trimSet).toEqual(new Set(['ǝ', 'Ǝ']));
  });

  // P3 / P4 — { s, ſ, S } retain-then-retire
  it('P3: produced { s, long-s, S }, trimming long-s (U+017F) keeps S', () => {
    const produced = new Set(['s', 'ſ', 'S']);
    const trimSet = caseTrimSet('ſ', produced, undefined);
    expect(trimSet).toEqual(new Set(['ſ']));
    expect(trimSet.has('S')).toBe(false);
  });

  it('P4: then trimming s (told about the already-trimmed long-s) trims S too', () => {
    const produced = new Set(['s', 'ſ', 'S']);
    const trimSet = caseTrimSet('s', produced, undefined, new Set(['ſ']));
    expect(trimSet).toEqual(new Set(['s', 'S']));
  });

  // P5 — null cases, single-character trim, no phantom
  it.each([
    ['ß U+00DF (multi-char expansion)', 'ß'],
    ['ĸ U+0138 (self-mapping)', 'ĸ'],
    ['ǲ U+01F2 (titlecase, fails guard 2)', 'ǲ'],
    ['combining grave accent U+0301', '́'],
    ['ك Arabic kaf (caseless script)', 'ك'],
  ])('P5: %s trims as a single character, no phantom counterpart', (_label, ch) => {
    const produced = new Set([ch]);
    const group = caseGroupFor(ch, produced, undefined);
    expect(group).toEqual({ upper: null, lowers: [ch] });
    expect(caseTrimSet(ch, produced, undefined)).toEqual(new Set([ch]));
  });

  // P7 — bcp47 "tr" splits { i, ı, İ, I } into two 1:1 groups
  it('P7: bcp47 "tr" splits { i, dotless-i, dotted-I, I } into i<->İ and ı<->I', () => {
    const produced = new Set(['i', 'ı', 'İ', 'I']);

    const dottedGroup = caseGroupFor('i', produced, 'tr');
    expect(dottedGroup).toEqual({ upper: 'İ', lowers: ['i'] });

    const dotlessGroup = caseGroupFor('ı', produced, 'tr');
    expect(dotlessGroup).toEqual({ upper: 'I', lowers: ['ı'] });

    expect(caseTrimSet('i', produced, 'tr')).toEqual(new Set(['i', 'İ']));
    expect(caseTrimSet('ı', produced, 'tr')).toEqual(new Set(['ı', 'I']));
  });

  // P8 — no bcp47, { i, ı, I } share one I
  it('P8: no bcp47, { i, dotless-i, I } share one I with lowers [i, dotless-i]', () => {
    const produced = new Set(['i', 'ı', 'I']);
    const group = caseGroupFor('i', produced, undefined);
    expect(group.upper).toBe('I');
    expect(group.lowers).toEqual(['i', 'ı']);

    // trimming just i keeps I (dotless-i still references it)
    expect(caseTrimSet('i', produced, undefined)).toEqual(new Set(['i']));
    // trimming both i and dotless-i in the same action retires I
    expect(caseTrimSet('i', produced, undefined, new Set(['ı']))).toEqual(new Set(['i', 'I']));
  });

  // P10 — uppercase counterpart not in the produced set
  it('P10: uppercase counterpart absent from produced -> upper null, trim acts alone', () => {
    const produced = new Set(['ə']); // just e, no E
    const group = caseGroupFor('ə', produced, undefined);
    expect(group).toEqual({ upper: null, lowers: ['ə'] });
    expect(caseTrimSet('ə', produced, undefined)).toEqual(new Set(['ə']));
  });

  // P11 — no local toUpperCase()/toLowerCase() in this module
  it('P11: carveCasePairs.ts contains no local toUpperCase()/toLowerCase() calls', () => {
    const testFilePath = fileURLToPath(import.meta.url);
    const modulePath = join(dirname(testFilePath), 'carveCasePairs.ts');
    const source = readFileSync(modulePath, 'utf-8');
    expect(source).not.toContain('toUpperCase(');
    expect(source).not.toContain('toLowerCase(');
  });
});
