// Helpers to convert raw IR types into display-ready structures for the carve cards.

import type {
  ContextElement,
  OutputElement,
  IRRule,
  IRGroup,
  KeyboardIR,
  Pattern,
  StoreItem,
} from '@keyboard-studio/contracts';

// ---------------------------------------------------------------------------
// isCombining — true for Unicode combining diacritical marks (U+0300–U+036F)
// ---------------------------------------------------------------------------

export const isCombining = (ch: string) => {
  const c = ch?.codePointAt(0) ?? 0;
  return c >= 0x0300 && c <= 0x036f;
};

export interface CarveGlyph {
  gid: string;
  keys: string[];
  ch: string;
}

// ---------------------------------------------------------------------------
// contextToKeys — convert LHS context to a human-readable key sequence
// ---------------------------------------------------------------------------

export function contextToKeys(context: ContextElement[]): string[] {
  const keys: string[] = [];
  for (const el of context) {
    switch (el.kind) {
      case 'char':
        keys.push(el.value);
        break;
      case 'vkey':
        keys.push(el.name);
        break;
      case 'deadkey':
        keys.push('‹dk›');
        break;
      case 'any':
        // store-based — no single key representation
        break;
      case 'notany':
        break;
      case 'context':
        break;
      case 'index':
        break;
      case 'baselayout':
        break;
      case 'raw':
        break;
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// outputToChar — extract the primary output character from RHS
// ---------------------------------------------------------------------------

export function outputToChar(output: OutputElement[]): string {
  for (const el of output) {
    switch (el.kind) {
      case 'char':
        return el.value;
      case 'deadkey':
        return '‹dk›';
      case 'index':
        return '…';
      case 'outs':
        return '…';
      case 'beep':
        return '🔔';
      case 'raw':
        return '?';
    }
  }
  return '?';
}

// ---------------------------------------------------------------------------
// ruleToGlyph — single IRRule → CarveGlyph (null if not displayable)
// ---------------------------------------------------------------------------

function ruleToGlyph(rule: IRRule, prefix: string, index: number): CarveGlyph | null {
  const keys = contextToKeys(rule.context);
  if (keys.length === 0) return null;
  const ch = outputToChar(rule.output);
  if (ch === '?' || ch === '‹dk›') return null;
  return { gid: `${prefix}#r${index}`, keys, ch };
}

// ---------------------------------------------------------------------------
// groupToGlyphs — all displayable rules in a group
// ---------------------------------------------------------------------------

export function groupToGlyphs(group: IRGroup): CarveGlyph[] {
  const glyphs: CarveGlyph[] = [];
  group.rules.forEach((rule, i) => {
    if (rule.ownedByPattern !== undefined) return;
    const g = ruleToGlyph(rule, group.nodeId, i);
    if (g) glyphs.push(g);
  });
  return glyphs;
}

// ---------------------------------------------------------------------------
// patternToGlyphs — derive character map from a Pattern's owned IR rules
// ---------------------------------------------------------------------------

export function patternToGlyphs(pattern: Pattern, ir: KeyboardIR): CarveGlyph[] {
  if (!pattern.ownedNodes || pattern.ownedNodes.length === 0) return [];

  const ownedIds = new Set(pattern.ownedNodes.map((n) => n.nodeId));
  const glyphs: CarveGlyph[] = [];

  // Walk all groups looking for rules owned by this pattern
  for (const group of ir.groups) {
    group.rules.forEach((rule, ruleIdx) => {
      if (!ownedIds.has(rule.nodeId)) return;
      const g = ruleToGlyph(rule, pattern.id, glyphs.length);
      if (g) glyphs.push({ ...g, gid: `${pattern.id}#${glyphs.length}` });
    });
  }

  return glyphs;
}

// ---------------------------------------------------------------------------
// storeChars — extract displayable characters from a store's items
// ---------------------------------------------------------------------------

export function storeChars(store: { items: StoreItem[] }): string[] {
  return store.items
    .filter((item) => item.kind === 'char')
    .map((item) => (item as { kind: 'char'; value: string }).value);
}
