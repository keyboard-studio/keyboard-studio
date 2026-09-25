// Stable digest of the rules a context-tolerance decision was made about
// (spec 078, research D7).
//
// A recorded accept/decline stays valid only while the rules it covered are
// unchanged: the fingerprint is compared to decide whether to raise the
// proposal again (FR-009) and whether an accepted site has gone stale. It is
// computed from each rule's emitted `.kmn` text, so it survives a reload
// (parse → emit → parse) and ignores parse-only metadata such as
// `sourceLine`. The parser's rule ids are positional, so nothing here depends
// on them beyond looking a rule up.

import type { KeyboardIR } from '@keyboard-studio/contracts';

import { emitRule } from '../codec/emit.js';

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

function fnv1a64Hex(text: string): string {
  let hash = FNV64_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Each rule's emitted `.kmn` text, by rule id. */
function ruleTexts(ir: KeyboardIR): Map<string, string> {
  const textById = new Map<string, string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) textById.set(rule.nodeId, emitRule(rule, group.usingKeys));
  }
  return textById;
}

/**
 * FNV-1a 64-bit hex digest over each listed rule's emitted `.kmn` text, the
 * texts sorted and joined with `\n`. Sorting by text rather than by rule id
 * keeps the digest stable when rules elsewhere in the keyboard are inserted or
 * removed, which shifts every later rule id. A listed id with no matching rule
 * contributes a `<missing:id>` line, so deleting a rule changes the digest
 * too. Duplicate ids count once.
 */
export function toleranceFingerprint(ir: KeyboardIR, ruleIds: readonly string[]): string {
  const textById = ruleTexts(ir);
  const lines = [...new Set(ruleIds)].map((id) => textById.get(id) ?? `<missing:${id}>`).sort();
  return fnv1a64Hex(lines.join('\n'));
}

/**
 * A position-independent identity for each listed rule: the digest of its own
 * emitted text, keyed by rule id. Used as the context-tolerance site id, so an
 * accepted site still names the same rule after a re-parse renumbers the ids.
 */
export function toleranceSiteKeys(ir: KeyboardIR, ruleIds: readonly string[]): Record<string, string> {
  const textById = ruleTexts(ir);
  return Object.fromEntries(
    ruleIds.map((id) => [id, fnv1a64Hex(textById.get(id) ?? `<missing:${id}>`)] as const),
  );
}
