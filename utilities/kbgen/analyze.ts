// Stages 1-3 of the pipeline: turn each target character into a feature record,
// score candidate anchor keys from objective signals, and compute key availability.
//
// The whole point of the design is that every "human instinct" for placement maps to
// an objective signal that exists for ALL scripts, so the same cascade works whether
// the character is Latin ɓ, Arabic پ, or a Tamil vowel sign:
//
//   instinct           signal                                    source            via
//   "looks like b"     canonical decomposition (NFD)             String.normalize  DECOMPOSITION
//   "B WITH HOOK"      Unicode character name parse              UnicodeData.txt   NAME
//   "looks like y"     confusable skeleton                       confusables.txt   CONFUSABLE
//   (identity gap)     curated look-alike (ENG->n, EZH->z)       supplement.json   VISUAL
//   "sounds like g"    phonetic / transliteration                supplement.json   PHONETIC
//
// UCD + confusables are the vendored full datasets (fetch-data.ts); supplement.json is a
// tiny curated layer for offline fallback + the letter-identity look-alikes UTS #39 omits.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyForChar } from './layout.ts';
import type { Layout, KeyEntry } from './layout.ts';
import * as ucd from './sources/ucd.ts';
import * as confusables from './sources/confusables.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SuppEntry {
  name?: string;
  visual?: string;
  ipa?: string;
}

interface Supplement {
  chars: Record<string, SuppEntry>;
}

const SUPP: Record<string, SuppEntry> = (JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'supplement.json'), 'utf8')
) as Supplement).chars;

// Confidence weights per signal, highest first. A character can match several; the
// scorer keeps them all (ranked) so output can explain why a key was chosen.
export const WEIGHT: Record<string, number> = { DECOMPOSITION: 100, NAME: 90, CONFUSABLE: 70, VISUAL: 60, PHONETIC: 40 };

// Shared utilities for codepoint handling
export const codepointOf = (ch: string): number => {
  const cp = ch.codePointAt(0);
  if (cp === undefined) throw new Error(`Invalid character: "${ch}"`);
  return cp;
};

export const codepointHex = (ch: string): string => codepointOf(ch).toString(16).toUpperCase().padStart(4, '0');

export const isCombining = (ch: string): boolean => {
  const c = codepointOf(ch);
  return (c >= 0x0300 && c <= 0x036F) || (c >= 0x1AB0 && c <= 0x1AFF) ||
         (c >= 0x1DC0 && c <= 0x1DFF) || (c >= 0x20D0 && c <= 0x20FF);
};

export const isAsciiLetterCp = (cp: number): boolean => (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);

const cp = codepointHex;

export interface ParseNameResult {
  base: string | null;
  upper: boolean | null;
  mods: string[];
}

// Parse a Unicode character name into a base ASCII letter + descriptive modifiers.
// "LATIN SMALL LETTER B WITH HOOK"  -> { base:'b', upper:false, mods:['HOOK'] }
// "LATIN CAPITAL LETTER OPEN E"     -> { base:'E', upper:true,  mods:['OPEN'] }
// "LATIN SMALL LETTER ENG"          -> { base:null }  (no base letter in the name)
export function parseName(name: string | null): ParseNameResult {
  if (!name) return { base: null, upper: null, mods: [] };
  const upper = / CAPITAL /.test(name) ? true : (/ SMALL /.test(name) ? false : null);
  const m = name.match(/LETTER\s+(.*)$/);
  if (!m) return { base: null, upper, mods: [] };
  const leading: string[] = [];
  const LEAD = ['OPEN', 'TURNED', 'REVERSED', 'INVERTED', 'AFRICAN', 'SCRIPT', 'CLOSED', 'BARRED', 'DOTLESS'];
  let tokens = m[1].trim().split(/\s+/);
  while (tokens.length > 1 && LEAD.includes(tokens[0])) leading.push(tokens.shift() as string);
  const base = tokens[0] && /^[A-Z]$/.test(tokens[0]) ? tokens[0] : null;
  const withIdx = tokens.indexOf('WITH');
  const mods = leading.concat(withIdx >= 0 ? tokens.slice(withIdx + 1) : tokens.slice(1));
  if (!base) return { base: null, upper, mods };
  return { base: upper ? base : base.toLowerCase(), upper, mods: mods.filter((t) => t !== 'WITH') };
}

export interface CharFeature {
  ch: string;
  code: string;
  name: string | null;
  upper: boolean | null;
  decompBase: string | null;
  marks: string[];
  nameBase: string | null;
  mods: string[];
  confusable: string | null;
  visual: string | null;
  phonetic: string | null;
}

// Stage 1: full feature record for one character.
export function analyzeChar(ch: string): CharFeature {
  const code = cp(ch);
  const supp = SUPP[code] || {};
  // Name: prefer the vendored UCD (covers all codepoints); fall back to the supplement.
  const name = ucd.nameOf(ch) || supp.name || null;

  // Signal 1 - canonical decomposition (NFD). A base letter + combining marks means the
  // base letter is the strongest anchor hint (handles precomposed accents like é).
  const nfd = ch.normalize('NFD');
  let decompBase: string | null = null;
  const marks: string[] = [];
  if (nfd.length > 1) {
    const chars = [...nfd];
    if (!isCombining(chars[0]) && chars.slice(1).every(isCombining)) {
      decompBase = chars[0];
      marks.push(...chars.slice(1));
    }
  }

  const named = parseName(name);

  return {
    ch,
    code,
    name,
    upper: named.upper,
    decompBase,                                  // base letter from NFD (or null)
    marks,                                       // combining marks stripped by NFD
    nameBase: named.base,                        // base letter parsed from the name
    mods: named.mods,                            // e.g. ['HOOK'], ['OPEN']
    confusable: confusables.skeletonBase(ch),    // first ASCII letter via UTS #39 skeleton
    visual: supp.visual || null,                 // curated look-alike (identity gap)
    phonetic: supp.ipa || null,                  // phonetic / transliteration fallback
  };
}

export interface AnchorCandidate {
  key: string;
  char: string;
  via: string;
  weight: number;
}

// Stage 2: rank candidate anchor keys for a character against a base layout.
// Returns [{ key, char, via, weight }] sorted by weight desc.
export function scoreAnchors(feature: CharFeature, layout: Layout): AnchorCandidate[] {
  const out: AnchorCandidate[] = [];
  const add = (sourceChar: string | null, via: string) => {
    if (!sourceChar) return;
    const k: KeyEntry | null = keyForChar(layout, sourceChar);
    if (k) out.push({ key: k.key, char: sourceChar, via, weight: WEIGHT[via] });
  };
  add(feature.decompBase, 'DECOMPOSITION');
  add(feature.nameBase, 'NAME');
  add(feature.confusable, 'CONFUSABLE');
  add(feature.visual, 'VISUAL');
  add(feature.phonetic, 'PHONETIC');

  const best = new Map<string, AnchorCandidate>();
  for (const c of out) {
    const prev = best.get(c.key);
    if (!prev || c.weight > prev.weight) best.set(c.key, c);
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight);
}

// Stage 3: which base-layout keys are "free" -- their letter is not used by the
// orthography. `usedLetters` is the set of characters the language writes (CLDR
// exemplars, or an explicit list). A free key can host a direct remap.
export function availability(layout: Layout, usedLetters: Iterable<string> | null | undefined): Set<string> {
  const used = new Set([...(usedLetters || [])].map((c) => c.toLowerCase()));
  const free = new Set<string>();
  for (const k of layout.keys) {
    if (!used.has(k.lower)) free.add(k.key);
  }
  return free;
}
