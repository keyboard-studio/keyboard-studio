import { useState, useEffect } from 'react';
import type { CarveNode, CarveGlyph, StoreRuleDetail } from '../../../lib/irToCarveNodes.ts';
import { nodeState, displayChar, invisibleCharLabel, MOD_GROUP_DEFS, glyphsTriState } from '../../../lib/irToCarveNodes.ts';
import { ToggleBox } from './ToggleBox.tsx';
import { GlyphCell } from './GlyphCell.tsx';
import { KindBadge, KIND_COLOR } from './KindBadge.tsx';
import { WarnIcon } from './carveShared.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

/**
 * Pure helper — returns the plain-English description for the linked-pair section
 * of a store's Inspector panel.
 *
 * Describes the invariant that always holds for any()/index() store pairs —
 * the position-for-position alignment — without referencing the trigger key.
 * The trigger is shown separately in the "Triggered by:" line.
 *
 * @param asSource - true when the store is used on the any() (input) side
 * @param asOutput - true when the store is used on the index() (output) side
 * @param pairedNames - display names of the peer stores
 */
export function storePairDescription(
  asSource: boolean,
  asOutput: boolean,
  pairedNames: string[],
): string {
  const pairedList = pairedNames.join(', ');
  if (asSource && !asOutput) {
    return `This is the input side of a paired-store rule. Its characters line up one-for-one with ${pairedList}. When one of these is matched and the rule fires, the keyboard outputs the character at the same position in ${pairedList}.`;
  }
  if (asOutput && !asSource) {
    return `This is the output side of a paired-store rule. Each character lines up one-for-one with ${pairedList}; the rule picks the matching one based on what was input.`;
  }
  return `This list is paired with ${pairedList} in a rule: the two line up one-for-one, one providing the input characters and the other the output.`;
}

const btnGhost: React.CSSProperties = {
  font: '600 12.5px var(--app-font)', cursor: 'pointer',
  color: 'var(--app-accent-text)', background: 'var(--app-surface-2)',
  border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '7px 13px',
  whiteSpace: 'nowrap',
};

function StrategyChip({ id }: { id: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 11px/1 var(--app-font-mono)', color: 'var(--app-text-muted)', background: 'var(--app-surface-2)', border: '1px solid var(--app-border)', padding: '3px 8px', borderRadius: 5 }}>
      <b style={{ color: 'var(--app-accent-text)' }}>{id}</b>
    </span>
  );
}

function LoadBearing() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 11px var(--app-font)', color: 'var(--sil-orange-dark)' }}>
      <WarnIcon size={13} /> load-bearing
    </span>
  );
}

const blurbStyle: React.CSSProperties = {
  margin: '10px 0 0', fontSize: 12, color: 'var(--app-text-subtle)', lineHeight: 1.55,
};

function storeBlurb(node: CarveNode): string {
  if (node.referencedByNodeId !== undefined)
    return "Stores are named character lists that rules in patterns and groups reference, not the rules themselves. This store belongs to the pattern above; its removal is managed through that pattern.";
  const u = node.storeUsage;
  if (!u)
    return "Stores are named character lists that rules in patterns and groups reference, not the rules themselves. This one isn't referenced by any active rules, so it's likely safe to remove on its own.";
  if (u.asSource && u.asOutput)
    return "Stores are named character lists that rules in patterns and groups reference, not the rules themselves. This one is used on both sides: rules scan your input against it AND pick their output from it.";
  if (u.asSource)
    return "Stores are named character lists that rules in patterns and groups reference, not the rules themselves. Rules scan your input against this list; when a character matches, the rule fires.";
  return "Stores are named character lists that rules in patterns and groups reference, not the rules themselves. Rules pick their output character from this list based on which key was pressed.";
}

// ---------------------------------------------------------------------------
// RawDetail
// ---------------------------------------------------------------------------
interface RawDetailProps {
  node: CarveNode;
  isDeleted: (nodeId: string) => boolean;
  onToggleNode: (nodeId: string, off: boolean) => void;
}
function RawDetail({ node, isDeleted, onToggleNode }: RawDetailProps) {
  const off = isDeleted(node.nodeId);
  const [confirming, setConfirming] = useState(false);
  // Reset confirm state whenever this node changes or gets restored
  useEffect(() => { setConfirming(false); }, [node.nodeId, off]);

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px' }}>
      <p style={{ ...blurbStyle, margin: '0 0 14px' }}>
        Advanced rules use syntax the tool can't model automatically: deadkey chains, context-sensitive substitutions, or platform-specific behaviour. They're kept exactly as written from the original keyboard.
      </p>
      <div style={{
        display: 'flex', gap: 13, padding: '16px 18px', borderRadius: 12, opacity: off ? 0.6 : 1,
        background: off ? 'var(--app-surface)' : 'color-mix(in srgb, var(--sil-orange) 9%, var(--app-surface))',
        border: '1px solid color-mix(in srgb, var(--sil-orange) 45%, transparent)',
      }}>
        <span style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sil-orange-dark)', background: 'color-mix(in srgb, var(--sil-orange) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--sil-orange) 40%, transparent)' }}>
          <WarnIcon size={20} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--app-text)', textDecoration: off ? 'line-through' : 'none' }}>
              Advanced rule (kept verbatim)
            </h2>
            <KindBadge kind="raw" />
          </div>
          <p style={{ margin: '7px 0 0', fontSize: 13.5, color: 'var(--app-text-muted)', lineHeight: 1.6 }}>
            Can't be previewed or edited. There's no typed structure to show. Reason:{' '}
            <b style={{ color: 'var(--app-text)', fontFamily: 'var(--app-font-mono)' }}>{node.rawReason}</b>.<br />
            These look like noise but are usually <b>load-bearing</b>. Remove only if you're certain this behaviour is unused by your language.
          </p>
          {off ? (
            <button onClick={() => onToggleNode(node.nodeId, false)} style={{ ...btnGhost, marginTop: 14 }}>
              Restore
            </button>
          ) : confirming ? (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: 'var(--app-text-muted)', flex: '1 1 100%' }}>Remove this rule? It may be load-bearing.</span>
              <button
                onClick={() => { onToggleNode(node.nodeId, true); setConfirming(false); }}
                style={{ font: '600 12px var(--app-font)', cursor: 'pointer', color: 'var(--sil-orange-dark)', background: 'color-mix(in srgb, var(--sil-orange) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--sil-orange) 55%, transparent)', borderRadius: 7, padding: '5px 12px', whiteSpace: 'nowrap' }}
              >
                Yes, remove
              </button>
              <button
                onClick={() => setConfirming(false)}
                style={{ font: '600 12px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: '1px solid var(--app-border)', borderRadius: 7, padding: '5px 12px', whiteSpace: 'nowrap' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} style={{ ...btnGhost, marginTop: 14 }}>
              Remove anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StoreDetail
// ---------------------------------------------------------------------------
interface StoreDetailProps {
  node: CarveNode;
  nodes: CarveNode[];
  isDeleted: (nodeId: string) => boolean;
  isItemDeleted: (id: string) => boolean;
  onToggleNode: (nodeId: string, off: boolean) => void;
  onSelectNode?: ((nodeId: string) => void) | undefined;
}
function storeRoleChip(node: CarveNode): React.ReactNode {
  const u = node.storeUsage;
  if (!u) return null;
  if (u.asSource && u.asOutput) return (
    <span style={{ font: '600 10px/1 var(--app-font)', padding: '3px 7px', borderRadius: 5, background: 'color-mix(in srgb, #b8a0d8 18%, var(--app-surface))', border: '1px solid color-mix(in srgb, #b8a0d8 50%, transparent)', color: '#c8b0e8' }}>in+out</span>
  );
  if (u.asSource) return (
    <span style={{ font: '600 10px/1 var(--app-font)', padding: '3px 7px', borderRadius: 5, background: 'var(--app-accent-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-accent-text)' }}>input</span>
  );
  if (u.asOutput) return (
    <span style={{ font: '600 10px/1 var(--app-font)', padding: '3px 7px', borderRadius: 5, background: 'color-mix(in srgb, #7dbf8e 15%, var(--app-surface))', border: '1px solid color-mix(in srgb, #7dbf8e 40%, transparent)', color: '#7dbf8e' }}>output</span>
  );
  return null;
}


function ruleDetailLabel(r: { isKeystroke: boolean; isContextSensitive: boolean; precedingLabel: string; producesOutput: boolean }): string {
  const base = r.isKeystroke
    ? 'type a character from this list, then the keyboard replaces it with its matching output'
    : r.producesOutput
      ? 'when this character is already in the buffer, then the keyboard replaces it with its matching output'
      : 'when this character is already in the buffer, used as context to trigger the rule';
  if (!r.isContextSensitive) return base.replace(/^(type|when)/, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  const after = r.precedingLabel ? `After ${r.precedingLabel}: ` : 'After specific input: ';
  return after + base;
}

type RuleGroup = {
  key: string;
  isKeystroke: boolean;
  isContextSensitive: boolean;
  precedingLabel: string;
  producesOutput: boolean;
  platformGuard: string | null;
  rules: StoreRuleDetail[];
};

function groupRuleDetails(rules: StoreRuleDetail[]): RuleGroup[] {
  const map = new Map<string, RuleGroup>();
  for (const r of rules) {
    const key = `${r.isKeystroke}\x00${r.isContextSensitive}\x00${r.precedingLabel}\x00${r.producesOutput}\x00${r.platformGuard ?? ''}`;
    if (!map.has(key)) map.set(key, { key, isKeystroke: r.isKeystroke, isContextSensitive: r.isContextSensitive, precedingLabel: r.precedingLabel, producesOutput: r.producesOutput, platformGuard: r.platformGuard, rules: [] });
    map.get(key)!.rules.push(r);
  }
  return [...map.values()];
}

function RuleTypeBadge({ conditional }: { conditional: boolean }) {
  return (
    <span style={{
      font: '600 9px/1 var(--app-font)', padding: '2px 5px', borderRadius: 3, flexShrink: 0,
      background: conditional ? 'color-mix(in srgb, var(--sil-orange) 13%, var(--app-surface))' : 'var(--app-accent-subtle)',
      border: '1px solid ' + (conditional ? 'color-mix(in srgb, var(--sil-orange) 35%, transparent)' : 'var(--app-border)'),
      color: conditional ? 'var(--sil-orange-dark)' : 'var(--app-accent-text)',
    }}>
      {conditional ? 'CONDITIONAL' : 'DIRECT'}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span style={{
      font: '600 9px/1 var(--app-font)', padding: '2px 5px', borderRadius: 3, flexShrink: 0,
      background: 'color-mix(in srgb, var(--app-text-muted) 10%, var(--app-surface))',
      border: '1px solid var(--app-border)',
      color: 'var(--app-text-muted)',
    }}>
      {platform.toUpperCase()} ONLY
    </span>
  );
}

const RULE_GROUP_THRESHOLD = 10;

function StoreDetail({ node, nodes, isDeleted, isItemDeleted, onToggleNode, onSelectNode }: StoreDetailProps) {
  const off = isDeleted(node.nodeId);
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setExpandedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const refNode = node.referencedByNodeId !== undefined
    ? nodes.find((n) => n.nodeId === node.referencedByNodeId)
    : undefined;
  const refAlive = refNode !== undefined && nodeState(refNode, isItemDeleted, isDeleted) !== 'off';
  const chars = node.displayChars ?? [];

  // Build combined consumer list from patternRefs + groupRefs for the dependency chain
  const consumers = [
    ...(node.storeUsage?.patternRefs ?? []).map((r) => ({
      id: r.patternId,
      label: r.patternTitle,
      ruleCount: r.ruleCount,
      rules: r.rules,
      dead: isDeleted(r.patternId),
    })),
    ...(node.storeUsage?.groupRefs ?? []).map((r) => {
      const gNode = nodes.find((n) => n.nodeId === r.groupId);
      const dead = gNode ? nodeState(gNode, isItemDeleted, isDeleted) === 'off' : isDeleted(r.groupId);
      return { id: r.groupId, label: r.groupName, ruleCount: r.ruleCount, rules: r.rules, dead };
    }),
  ];
  const allConsumersDead = consumers.length > 0 && consumers.every((c) => c.dead);

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <ToggleBox glyph="⊷" state={off ? 'off' : 'on'} size={40} onClick={() => onToggleNode(node.nodeId, !off)} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: 'var(--app-font-mono)', color: 'var(--app-text)' }}>{node.name}</h2>
            <KindBadge kind="store" />
            {storeRoleChip(node)}
            {node.loadBearing === true && <LoadBearing />}
          </div>
          <p style={{ ...blurbStyle, margin: 0 }}>
            {storeBlurb(node)}
          </p>
        </div>
      </div>
      {node.storeRoleLine !== undefined && (
        <p style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--app-text-muted)', lineHeight: 1.45 }}>
          {node.storeRoleLine}
        </p>
      )}
      {(() => {
        const triggers = node.pairedStoreTriggers;
        if (!triggers || triggers.length === 0) return null;
        const distinct = [...new Set(triggers.filter((t): t is string => t !== undefined))];
        if (distinct.length === 0) return null;
        return (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--app-text-muted)', lineHeight: 1.45 }}>
            {'Triggered by: '}
            <b style={{ fontFamily: 'var(--app-font-mono)' }}>{distinct.join(', ')}</b>
          </p>
        );
      })()}
      {chars.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
          {chars.map((ch, i) => {
            const label = invisibleCharLabel(ch);
            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: label ? '9px 10px' : '9px 13px', borderRadius: 8, cursor: 'default',
                border: '1px solid ' + (off ? 'var(--app-border)' : 'var(--app-border-strong)'),
                borderTop: '3px solid ' + (off ? 'var(--app-border-strong)' : KIND_COLOR.store),
                background: off ? 'var(--app-surface-2)' : 'var(--app-surface)',
                opacity: off ? 0.6 : 1,
              }}>
                {label ? (
                  <span style={{ font: '600 10px/1 var(--app-font-mono)', color: off ? 'var(--app-text-subtle)' : 'var(--app-text-muted)', letterSpacing: '0.04em' }} title={`U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`}>
                    {label}
                  </span>
                ) : (
                  <span style={{ font: "400 22px/1 'Lora', serif", color: off ? 'var(--app-text-subtle)' : 'var(--app-text)' }}>
                    {displayChar(ch)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      {node.pairedStoreNames !== undefined && node.pairedStoreNames.length > 0 && (() => {
        const descriptionText = storePairDescription(
          node.storeUsage?.asSource ?? false,
          node.storeUsage?.asOutput ?? false,
          node.pairedStoreNames,
        );
        // Store-purple token — same hex used by KIND_COLOR.store in KindBadge/Rail
        const storeColor = KIND_COLOR.store;
        return (
          <div
            style={{
              marginTop: 18, padding: '12px 15px', borderRadius: 10,
              background: `color-mix(in srgb, ${storeColor} 7%, var(--app-surface))`,
              border: `1px solid color-mix(in srgb, ${storeColor} 30%, transparent)`,
            }}
          >
            <div style={{ font: '600 10px/1 var(--app-font)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--app-text-subtle)', marginBottom: 8 }}>
              Linked pair
            </div>
            {node.pairedStoreNames.map((pname, i) => {
              const pairedId = node.pairedStoreIds?.[i];
              const trigger = node.pairedStoreTriggers?.[i];
              const role = node.pairedStoreRoles?.[i];
              return (
                <div key={pname} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  {/* Clickable store name — purple, matches KindBadge store color */}
                  <button
                    onClick={() => pairedId !== undefined && onSelectNode?.(pairedId)}
                    disabled={pairedId === undefined || onSelectNode === undefined}
                    aria-label={`Go to store ${pname}`}
                    style={{
                      font: '600 11px/1 var(--app-font-mono)', padding: '3px 8px', borderRadius: 5,
                      background: `color-mix(in srgb, ${storeColor} 14%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${storeColor} 38%, transparent)`,
                      color: storeColor,
                      cursor: pairedId !== undefined && onSelectNode !== undefined ? 'pointer' : 'default',
                      outline: 'none',
                    }}
                    onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 2px color-mix(in srgb, ${storeColor} 40%, transparent)`; }}
                    onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
                  >
                    {pname}
                  </button>
                  {/* Role chip — the paired store's own role (input/output/input+output) */}
                  {role === 'input+output' && (
                    <span style={{ font: '600 10px/1 var(--app-font)', padding: '3px 7px', borderRadius: 5, background: 'color-mix(in srgb, #b8a0d8 18%, var(--app-surface))', border: '1px solid color-mix(in srgb, #b8a0d8 50%, transparent)', color: '#c8b0e8' }}>in+out</span>
                  )}
                  {role === 'input' && (
                    <span style={{ font: '600 10px/1 var(--app-font)', padding: '3px 7px', borderRadius: 5, background: 'var(--app-accent-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-accent-text)' }}>input</span>
                  )}
                  {role === 'output' && (
                    <span style={{ font: '600 10px/1 var(--app-font)', padding: '3px 7px', borderRadius: 5, background: 'color-mix(in srgb, #7dbf8e 15%, var(--app-surface))', border: '1px solid color-mix(in srgb, #7dbf8e 40%, transparent)', color: '#7dbf8e' }}>output</span>
                  )}
                  {/* Trigger key */}
                  {trigger !== undefined && (
                    <span style={{ font: '600 10px/1 var(--app-font)', color: 'var(--app-text-subtle)', whiteSpace: 'nowrap' }}>
                      Triggered by: <b style={{ color: 'var(--app-text-muted)', fontFamily: 'var(--app-font-mono)' }}>{trigger}</b>
                    </span>
                  )}
                </div>
              );
            })}
            <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--app-text-muted)', lineHeight: 1.55 }}>
              {descriptionText}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--app-text-subtle)', lineHeight: 1.55, fontStyle: 'italic' }}>
              These two stores work as a pair. Removing one without the other will break the mechanism.
            </p>
          </div>
        );
      })()}
      {consumers.length > 0 && (
        <div
          style={{
            marginTop: 18, padding: '12px 15px', borderRadius: 10,
            background: allConsumersDead ? 'color-mix(in srgb, var(--sil-orange) 9%, var(--app-surface))' : 'var(--app-surface)',
            border: '1px solid ' + (allConsumersDead ? 'color-mix(in srgb, var(--sil-orange) 45%, transparent)' : 'var(--app-border)'),
          }}
          onMouseEnter={() => setInfo({ kind: 'text', title: 'Relationship Advice', body: 'This panel shows every rule group that depends on this store. Stores are shared character lists. Removing one while rules still reference it will break those rules at compile time. Use this section to understand what\'s connected before you remove anything.' })}
          onMouseLeave={clearInfo}
        >
          <div style={{ font: '600 10px/1 var(--app-font)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--app-text-subtle)', marginBottom: 6 }}>
            Used by
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--app-text-subtle)', lineHeight: 1.5 }}>
            {node.storeUsage?.asSource && node.storeUsage?.asOutput
              ? 'These rules scan your input against this list and also pick their output character from it.'
              : node.storeUsage?.asSource
              ? 'These rules scan your input against this list; when you type a matching character, the rule fires.'
              : 'These rules pick their output character from this list based on which key you pressed.'}
          </p>
          {consumers.map((c) => (
            <div key={c.id} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: c.dead ? 400 : 600, color: c.dead ? 'var(--app-text-subtle)' : 'var(--app-text)', textDecoration: c.dead ? 'line-through' : 'none' }}>
                  {c.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--app-text-subtle)', whiteSpace: 'nowrap' }}>
                  {c.ruleCount} {c.ruleCount === 1 ? 'rule' : 'rules'}
                </span>
              </div>
              {c.rules.length > RULE_GROUP_THRESHOLD ? (
                groupRuleDetails(c.rules).map((g) => {
                  const gKey = `${c.id}-${g.key}`;
                  const expanded = expandedGroups.has(gKey);
                  return (
                    <div key={g.key} style={{ marginTop: 3, paddingLeft: 10 }}>
                      <button
                        onClick={() => toggleGroup(gKey)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                      >
                        <RuleTypeBadge conditional={g.isContextSensitive} />
                        {g.platformGuard && <PlatformBadge platform={g.platformGuard} />}
                        <span style={{ flex: 1, fontSize: 11, color: c.dead ? 'var(--app-text-subtle)' : 'var(--app-text-muted)', lineHeight: 1.45, textDecoration: c.dead ? 'line-through' : 'none' }}>
                          {ruleDetailLabel(g)}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--app-text-subtle)', whiteSpace: 'nowrap' }}>×{g.rules.length} {expanded ? '▼' : '▶'}</span>
                      </button>
                      {expanded && g.rules.map((r, i) => (
                        <div key={r.nodeId} style={{ fontSize: 11, color: 'var(--app-text-subtle)', paddingLeft: 10, lineHeight: 1.6 }}>
                          Rule {i + 1}
                        </div>
                      ))}
                    </div>
                  );
                })
              ) : (
                c.rules.map((r) => (
                  <div key={r.nodeId} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 3, paddingLeft: 10 }}>
                    <RuleTypeBadge conditional={r.isContextSensitive} />
                    {r.platformGuard && <PlatformBadge platform={r.platformGuard} />}
                    <span style={{ fontSize: 11, color: c.dead ? 'var(--app-text-subtle)' : 'var(--app-text-muted)', lineHeight: 1.45, textDecoration: c.dead ? 'line-through' : 'none' }}>
                      {ruleDetailLabel(r)}
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
          <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: allConsumersDead ? 'var(--sil-orange-dark)' : 'var(--app-text-subtle)' }}>
            {allConsumersDead
              ? 'All consumers removed. This store is now orphaned and safe to drop.'
              : (() => {
                  const total = node.storeUsage?.ruleCount ?? consumers.reduce((s, c) => s + c.ruleCount, 0);
                  return `If this store is removed, the ${total} ${total === 1 ? 'rule' : 'rules'} above that depend on it will break at compile time.`;
                })()}
          </p>
        </div>
      )}
      {node.referencedByLabel !== undefined && (
        <div style={{
          marginTop: 18, display: 'flex', gap: 11, padding: '12px 15px', borderRadius: 10,
          background: refAlive ? 'var(--app-surface)' : 'color-mix(in srgb, var(--sil-orange) 9%, var(--app-surface))',
          border: '1px solid ' + (refAlive ? 'var(--app-border)' : 'color-mix(in srgb, var(--sil-orange) 45%, transparent)'),
        }}>
          <span style={{ color: refAlive ? 'var(--app-accent-text)' : 'var(--sil-orange-dark)', flex: '0 0 auto', marginTop: 1 }}>
            {refAlive ? '🔗' : <WarnIcon size={16} />}
          </span>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--app-text)' }}>
            {refAlive
              ? <>Referenced by <b>{node.referencedByLabel}</b>. Keep this unless you remove that pattern too.</>
              : <><b>No longer referenced.</b> {node.referencedByLabel} was removed, so this store is now unused and safe to drop.</>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
interface InspectorProps {
  node: CarveNode | undefined;
  nodes: CarveNode[];
  isItemDeleted: (id: string) => boolean;
  onToggleGlyph: (gid: string) => void;
  onSetManyGlyphs: (gids: string[], off: boolean) => void;
  isDeleted: (nodeId: string) => boolean;
  onToggleNode: (nodeId: string, off: boolean) => void;
  onSelectNode?: ((nodeId: string) => void) | undefined;
}

export function Inspector({ node, nodes, isItemDeleted, onToggleGlyph, onSetManyGlyphs, isDeleted, onToggleNode, onSelectNode }: InspectorProps) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => { setQ(''); setCollapsed(new Set()); }, [node?.nodeId]);
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);

  if (!node) {
    return (
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--app-text-subtle)' }}>Select a node from the panel on the left</p>
      </div>
    );
  }

  if (node.kind === 'raw') return <RawDetail node={node} isDeleted={isDeleted} onToggleNode={onToggleNode} />;
  if (node.kind === 'store') return <StoreDetail key={node.nodeId} node={node} nodes={nodes} isDeleted={isDeleted} isItemDeleted={isItemDeleted} onToggleNode={onToggleNode} onSelectNode={onSelectNode} />;

  const glyphs = node.glyphs ?? [];
  const st = nodeState(node, isItemDeleted, isDeleted);
  const big = glyphs.length > 40;
  const shown = q.trim()
    ? glyphs.filter((x) => x.ch.toLowerCase().includes(q.toLowerCase()) || x.keys.join('').toLowerCase().includes(q.toLowerCase()))
    : glyphs;

  // Uniform cell height computed over all shown glyphs (uniform height across groups).
  const maxKeys = shown.length > 0 ? Math.max(...shown.map((x) => x.keys.length)) : 1;
  const rowHeight = Math.max(88, 60 + Math.ceil(maxKeys / 2) * 26);

  // Build modifier groups from shown glyphs using the shared MOD_GROUP_DEFS
  const groupedGlyphs = MOD_GROUP_DEFS.map((grp) => ({
    ...grp,
    glyphs: shown.filter((g) => grp.layers.includes(g.modifierLayer)),
  })).filter((grp) => grp.glyphs.length > 0);

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <ToggleBox glyph={node.trigger} state={st} size={40} onClick={() => onSetManyGlyphs(glyphs.map((x) => x.gid), st !== 'off')} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--app-text)', lineHeight: 1 }}>{node.name}</h2>
            <KindBadge kind={node.kind} />
            {node.strategy !== undefined && <StrategyChip id={node.strategy} />}
          </div>
          <p style={{ ...blurbStyle, margin: 0 }}>
            {node.kind === 'pattern'
              ? 'A recognized pattern groups related key rules by purpose, for example "vowels with diacritics" or "base alphabet". The tiles below show rules with visible character output. The pattern may also own store-dependent rules that don\'t appear as tiles; those are shown in the relevant stores\' "Used by" panels. Removing this pattern removes all of it.'
              : 'A group is a block of key rules from the original keyboard that hasn\'t been recognized as a named pattern. The tiles below show rules with visible character output. The group may also contain store-dependent rules that don\'t appear as tiles; those are shown in the relevant stores\' "Used by" panels. Removing this group removes all of it.'}
          </p>
        </div>
        <button
          onClick={() => onSetManyGlyphs(glyphs.map((x) => x.gid), st !== 'off')}
          onMouseEnter={() => setInfo({ kind: 'text', title: st === 'off' ? 'Keep all' : 'Remove all', body: st === 'off' ? 'Restore every key shown here so it types again.' : 'Remove every key shown here at once. You can restore them later from the removed-items menu.' })}
          onFocus={() => setInfo({ kind: 'text', title: st === 'off' ? 'Keep all' : 'Remove all', body: st === 'off' ? 'Restore every key shown here so it types again.' : 'Remove every key shown here at once. You can restore them later from the removed-items menu.' })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={btnGhost}
        >
          {st === 'off' ? 'Keep all' : 'Remove all'}
        </button>
      </div>

      {big && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 4px', padding: '11px 13px', background: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: 10 }}>
          <span style={{ font: '600 10.5px var(--app-font)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--app-text-subtle)' }}>Filter</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="character or key…"
            style={{ marginLeft: 'auto', width: 180, height: 30, padding: '0 11px', borderRadius: 7, font: '13px var(--app-font)', background: 'var(--app-surface-2)', border: '1px solid var(--app-border-strong)', color: 'var(--app-text)', outline: 'none' }}
          />
          <span style={{ fontSize: 12, color: 'var(--app-text-subtle)', whiteSpace: 'nowrap' }}>{shown.length} shown</span>
        </div>
      )}

      {groupedGlyphs.map((grp) => {
        const isCollapsed = collapsed.has(grp.id);
        const grpState = glyphsTriState(grp.glyphs, isItemDeleted);
        return (
          <div key={grp.id} style={{ marginTop: 18 }}>
            {/* Group header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <button
                onClick={() => toggleCollapsed(grp.id)}
                aria-expanded={!isCollapsed}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                  background: 'var(--app-surface)', border: '1px solid var(--app-border)',
                  borderRadius: 7, padding: '5px 10px', textAlign: 'left',
                }}
              >
                <span style={{ font: '600 11.5px var(--app-font)', color: grpState === 'off' ? 'var(--app-text-subtle)' : 'var(--app-text)', textDecoration: grpState === 'off' ? 'line-through' : 'none', letterSpacing: '.04em' }}>
                  {grp.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--app-text-subtle)' }}>
                  · {grp.glyphs.length} rules
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--app-text-subtle)' }}>
                  {isCollapsed ? '▶' : '▼'}
                </span>
              </button>
              {/* Per-group bulk button */}
              <button
                onClick={() => onSetManyGlyphs(grp.glyphs.map((g) => g.gid), grpState !== 'off')}
                onMouseEnter={() => setInfo({ kind: 'text', title: grpState === 'off' ? 'Keep all' : 'Remove all', body: grpState === 'off' ? `Restore every ${grp.label} key in this group.` : `Remove every ${grp.label} key in this group. You can restore them later.` })}
                onFocus={() => setInfo({ kind: 'text', title: grpState === 'off' ? 'Keep all' : 'Remove all', body: grpState === 'off' ? `Restore every ${grp.label} key in this group.` : `Remove every ${grp.label} key in this group. You can restore them later.` })}
                onMouseLeave={clearInfo}
                onBlur={clearInfo}
                style={{ ...btnGhost, fontSize: 11, padding: '5px 10px' }}
              >
                {grpState === 'off' ? 'Keep all' : 'Remove all'}
              </button>
            </div>
            {/* Per-group glyph subgrid */}
            {!isCollapsed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gridAutoRows: rowHeight + 'px', gap: 8 }}>
                {grp.glyphs.map((x: CarveGlyph) => (
                  <GlyphCell
                    key={x.gid}
                    gid={x.gid}
                    ch={x.ch}
                    keys={x.keys}
                    off={isItemDeleted(x.gid)}
                    color={KIND_COLOR[node.kind]}
                    onToggle={onToggleGlyph}
                    modifierLabel={x.modifierLabel}
                    capability={x.capability}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
