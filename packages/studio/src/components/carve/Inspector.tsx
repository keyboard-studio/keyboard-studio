import { useState, useEffect } from 'react';
import type { CarveNode } from '../../lib/irToCarveNodes.ts';
import { nodeState, displayChar, MOD_GROUP_DEFS, glyphsTriState } from '../../lib/irToCarveNodes.ts';
import { ToggleBox } from './ToggleBox.tsx';
import { GlyphCell } from './GlyphCell.tsx';
import { KindBadge, KIND_COLOR } from './KindBadge.tsx';
import { WarnIcon } from './carveShared.tsx';
import { useHoverInfoStore } from '../../stores/hoverInfoStore.ts';

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
  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px' }}>
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
              Advanced rule — kept verbatim
            </h2>
            <KindBadge kind="raw" />
          </div>
          <p style={{ margin: '7px 0 0', fontSize: 13.5, color: 'var(--app-text-muted)', lineHeight: 1.6 }}>
            Can't be previewed or edited — there's no typed structure to show. Reason:{' '}
            <b style={{ color: 'var(--app-text)', fontFamily: 'var(--app-font-mono)' }}>{node.rawReason}</b>.<br />
            These look like noise but are usually <b>load-bearing</b>. Remove only if you're certain this behaviour is unused by your language.
          </p>
          <button onClick={() => onToggleNode(node.nodeId, !off)} style={{ ...btnGhost, marginTop: 14 }}>
            {off ? 'Restore' : 'Remove anyway'}
          </button>
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

function storeDesc(node: CarveNode): string {
  const u = node.storeUsage;
  if (!u) {
    return node.referencedByLabel !== undefined
      ? 'Owned by a recognized pattern — removal is managed through the pattern.'
      : 'Defined but not directly referenced in any rules.';
  }
  const { ruleCount, asSource, asOutput, groupNames } = u;
  const n = ruleCount;
  const rs = n === 1 ? 'rule' : 'rules';
  const inG = groupNames.length > 0 ? ` in ${groupNames.join(', ')}` : '';
  if (asSource && asOutput) return `Used as both any() input and index() output in ${n} ${rs}${inG}.`;
  if (asSource) return `Matched by any() as input in ${n} ${rs}${inG} — these characters are context to match.`;
  if (asOutput) return `Output target for index() in ${n} ${rs}${inG} — these are the characters that get inserted.`;
  return `Referenced in ${n} ${rs}${inG}.`;
}

function StoreDetail({ node, nodes, isDeleted, isItemDeleted, onToggleNode }: StoreDetailProps) {
  const off = isDeleted(node.nodeId);
  const refNode = node.referencedByNodeId !== undefined
    ? nodes.find((n) => n.nodeId === node.referencedByNodeId)
    : undefined;
  const refAlive = refNode !== undefined && nodeState(refNode, isItemDeleted, isDeleted) !== 'off';
  const chars = node.displayChars ?? [];

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ToggleBox glyph="⊷" state={off ? 'off' : 'on'} size={40} onClick={() => onToggleNode(node.nodeId, !off)} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: 'var(--app-font-mono)', color: 'var(--app-text)' }}>{node.name}</h2>
            <KindBadge kind="store" />
            {storeRoleChip(node)}
            {node.loadBearing === true && <LoadBearing />}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--app-text-muted)', lineHeight: 1.55 }}>
            {storeDesc(node)}
          </p>
        </div>
      </div>
      {chars.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
          {chars.map((ch, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '9px 13px', borderRadius: 8, cursor: 'default',
              border: '1px solid ' + (off ? 'var(--app-border)' : 'var(--app-border-strong)'),
              borderTop: '3px solid ' + (off ? 'var(--app-border-strong)' : KIND_COLOR.store),
              background: off ? 'var(--app-surface-2)' : 'var(--app-surface)',
              opacity: off ? 0.6 : 1,
            }}>
              <span style={{ font: "400 22px/1 'Lora', serif", color: off ? 'var(--app-text-subtle)' : 'var(--app-text)' }}>
                {displayChar(ch)}
              </span>
            </span>
          ))}
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
              : <><b>No longer referenced</b> — {node.referencedByLabel} was removed, so this store is now unused and safe to drop.</>}
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
}

export function Inspector({ node, nodes, isItemDeleted, onToggleGlyph, onSetManyGlyphs, isDeleted, onToggleNode }: InspectorProps) {
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
  if (node.kind === 'store') return <StoreDetail node={node} nodes={nodes} isDeleted={isDeleted} isItemDeleted={isItemDeleted} onToggleNode={onToggleNode} />;

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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--app-text)' }}>{node.name}</h2>
            <KindBadge kind={node.kind} />
            {node.strategy !== undefined && <StrategyChip id={node.strategy} />}
          </div>
        </div>
        <button
          onClick={() => onSetManyGlyphs(glyphs.map((x) => x.gid), st !== 'off')}
          onMouseEnter={() => setInfo({ kind: 'text', title: st === 'off' ? 'Keep all' : 'Remove all', body: st === 'off' ? 'Restore every key shown here so it types again.' : 'Remove every key shown here at once — you can restore them later from the removed-items menu.' })}
          onFocus={() => setInfo({ kind: 'text', title: st === 'off' ? 'Keep all' : 'Remove all', body: st === 'off' ? 'Restore every key shown here so it types again.' : 'Remove every key shown here at once — you can restore them later from the removed-items menu.' })}
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
                onMouseEnter={() => setInfo({ kind: 'text', title: grpState === 'off' ? 'Keep all' : 'Remove all', body: grpState === 'off' ? `Restore every ${grp.label} key in this group.` : `Remove every ${grp.label} key in this group — you can restore them later.` })}
                onFocus={() => setInfo({ kind: 'text', title: grpState === 'off' ? 'Keep all' : 'Remove all', body: grpState === 'off' ? `Restore every ${grp.label} key in this group.` : `Remove every ${grp.label} key in this group — you can restore them later.` })}
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
                {grp.glyphs.map((x) => (
                  <GlyphCell
                    key={x.gid}
                    gid={x.gid}
                    ch={x.ch}
                    keys={x.keys}
                    off={isItemDeleted(x.gid)}
                    color={KIND_COLOR[node.kind]}
                    onToggle={onToggleGlyph}
                    modifierLabel={x.modifierLabel}
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
