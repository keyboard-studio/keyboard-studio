// Context-tolerance overlay: accepted generated rules as replayable data
// (spec 078, research §10 amendment "apply path").
//
// The studio never emits its working IR into the artifact: the preview and the
// download re-project the `.kmn` from the base keyboard plus recorded overlays
// (carve, assignments, key edits). Generating context-tolerance rules compiles
// and simulates, so it cannot run inside that synchronous projection. Instead
// the apply effect records the verified rules once, as this overlay, and the
// projection replays them with `applyContextToleranceOverlay`.
//
// Nothing here depends on rule ids, which the parser assigns by position and
// which shift whenever a rule is inserted:
//   - each batch names its group by `name` and its insertion point by the
//     emitted text of the rule it sits before;
//   - each batch carries its site key (the source rule's text digest, from
//     `toleranceSiteKeys`), which is how a decision names it;
//   - `removeContextToleranceOverlay` recognises replayed rules by their text,
//     so an analysis of the projected keyboard can see it without the overlay.
//
// Simulator-free and compiler-free: the studio's projection imports this from
// the root engine entry.

import type { ContextVariant, IRComment, IRRule, KeyboardIR } from '@keyboard-studio/contracts';

import { emitRule } from '../codec/emit.js';

/** One source rule's generated rules, inserted together. JSON-safe. */
export interface ContextToleranceOverlayBatch {
  /** The source rule's text digest (`toleranceSiteKeys`): the site this batch fixes. */
  siteKey: string;
  /** The group the rules go in, by `IRGroup.name`. */
  groupName: string;
  /** Emitted text of the rule the batch sits before; `null` for the end of the group. */
  beforeRuleText: string | null;
  /** The leading comment on the batch (FR-015). */
  comment: string;
  rules: IRRule[];
}

export interface ContextToleranceOverlay {
  batches: ContextToleranceOverlayBatch[];
}

export interface ContextToleranceOverlayResult {
  ir: KeyboardIR;
  /** Batches that could not be placed (group or anchor rule gone). */
  warnings: string[];
}

/**
 * Extract the overlay for `acceptedRuleIds` from a proposal's candidate IR.
 *
 * `result` is `proposeContextVariants`' output: its `ir` holds the generated
 * rules in place. Only diacritic variants (those with a `precomposedOutput`)
 * are carried; the backspace-unwrap block is not offered as a site.
 */
export function buildContextToleranceOverlay(
  result: { ir: KeyboardIR; variants: readonly ContextVariant[] },
  acceptedRuleIds: ReadonlySet<string>,
  siteKeys: Readonly<Record<string, string>>,
): ContextToleranceOverlay {
  const sourceByMarker = new Map(
    result.variants
      .filter((v) => v.precomposedOutput !== undefined)
      .map((v) => [v.generatedMarker, v.sourceRuleId] as const),
  );
  const commentByRule = new Map<string, string>();
  for (const c of result.ir.comments) {
    if (c.anchor === 'leading' && c.anchorRef?.kind === 'rule') commentByRule.set(c.anchorRef.nodeId, c.text);
  }

  const batches: ContextToleranceOverlayBatch[] = [];
  for (const group of result.ir.groups) {
    const rules = group.rules;
    let i = 0;
    while (i < rules.length) {
      const source = sourceByMarker.get(rules[i]!.nodeId);
      if (source === undefined) {
        i++;
        continue;
      }
      // A run of consecutive rules generated for the same source rule.
      let j = i;
      while (j < rules.length && sourceByMarker.get(rules[j]!.nodeId) === source) j++;
      if (acceptedRuleIds.has(source)) {
        // Anchor on the next rule that is not itself generated.
        let k = j;
        while (k < rules.length && sourceByMarker.has(rules[k]!.nodeId)) k++;
        const anchor = rules[k];
        batches.push({
          siteKey: siteKeys[source] ?? source,
          groupName: group.name,
          beforeRuleText: anchor === undefined ? null : emitRule(anchor, group.usingKeys),
          comment: commentByRule.get(rules[i]!.nodeId) ?? '',
          rules: rules.slice(i, j).map((r) => structuredClone(r)),
        });
      }
      i = j;
    }
  }
  return { batches };
}

/**
 * Replay `overlay` onto `ir`: insert each batch before its anchor rule in its
 * group, with its leading comment. Batches sharing an anchor keep their order.
 * A batch whose group or anchor is gone is skipped and reported, never placed
 * somewhere else (a misplaced rule could be shadowed, or shadow a fallback).
 */
export function applyContextToleranceOverlay(
  ir: KeyboardIR,
  overlay: ContextToleranceOverlay,
): ContextToleranceOverlayResult {
  const warnings: string[] = [];
  const groups = ir.groups.map((g) => ({ ...g, rules: [...g.rules] }));
  const replayed = new Set<string>();
  const comments: IRComment[] = [...ir.comments];

  for (const batch of overlay.batches) {
    const group = groups.find((g) => g.name === batch.groupName);
    if (group === undefined || batch.rules.length === 0) {
      warnings.push(`context-tolerance rules for group "${batch.groupName}" skipped: the group no longer exists`);
      continue;
    }
    let index = group.rules.length;
    if (batch.beforeRuleText !== null) {
      index = group.rules.findIndex(
        (r) => !replayed.has(r.nodeId) && emitRule(r, group.usingKeys) === batch.beforeRuleText,
      );
      if (index === -1) {
        warnings.push(
          `context-tolerance rules skipped: the rule they belong before is no longer in group "${batch.groupName}"`,
        );
        continue;
      }
    }
    const rules = batch.rules.map((r) => structuredClone(r));
    for (const r of rules) replayed.add(r.nodeId);
    group.rules.splice(index, 0, ...rules);
    if (batch.comment !== '') {
      comments.push({
        nodeId: `${rules[0]!.nodeId}_comment`,
        text: batch.comment,
        anchor: 'leading',
        anchorRef: { kind: 'rule', nodeId: rules[0]!.nodeId },
      });
    }
  }
  return { ir: { ...ir, groups, comments }, warnings };
}

/**
 * The inverse, for analysis: remove rules matching the overlay's rules by
 * emitted text (per group), and their leading comments. Lets the studio
 * analyse a projected keyboard as it would be without the accepted fix, so the
 * decision's fingerprint and sites stay stable once the fix is in place.
 */
export function removeContextToleranceOverlay(ir: KeyboardIR, overlay: ContextToleranceOverlay): KeyboardIR {
  if (overlay.batches.length === 0) return ir;
  const textsByGroup = new Map<string, Set<string>>();
  const commentTexts = new Set<string>();
  for (const batch of overlay.batches) {
    const group = ir.groups.find((g) => g.name === batch.groupName);
    if (group === undefined) continue;
    const texts = textsByGroup.get(batch.groupName) ?? new Set<string>();
    for (const r of batch.rules) texts.add(emitRule(r, group.usingKeys));
    textsByGroup.set(batch.groupName, texts);
    if (batch.comment !== '') commentTexts.add(batch.comment.trim());
  }

  const removed = new Set<string>();
  const groups = ir.groups.map((g) => {
    const texts = textsByGroup.get(g.name);
    if (texts === undefined) return g;
    return {
      ...g,
      rules: g.rules.filter((r) => {
        const drop = texts.has(emitRule(r, g.usingKeys));
        if (drop) removed.add(r.nodeId);
        return !drop;
      }),
    };
  });
  const comments = ir.comments.filter(
    (c) =>
      !(
        commentTexts.has(c.text.trim()) &&
        (c.anchorRef === undefined || (c.anchorRef.kind === 'rule' && removed.has(c.anchorRef.nodeId)))
      ),
  );
  return { ...ir, groups, comments };
}

/**
 * The site keys whose batches are actually present in `ir` (every generated
 * rule of the batch found in its group, by emitted text). A batch the
 * projection had to skip is absent, so its site must not be reported fixed.
 */
export function presentContextToleranceSites(ir: KeyboardIR, overlay: ContextToleranceOverlay): string[] {
  const present: string[] = [];
  for (const batch of overlay.batches) {
    const group = ir.groups.find((g) => g.name === batch.groupName);
    if (group === undefined) continue;
    const texts = new Set(group.rules.map((r) => emitRule(r, group.usingKeys)));
    if (batch.rules.length > 0 && batch.rules.every((r) => texts.has(emitRule(r, group.usingKeys)))) {
      present.push(batch.siteKey);
    }
  }
  return present;
}
