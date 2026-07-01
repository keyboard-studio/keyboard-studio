import { useState, useMemo, useCallback, useEffect } from 'react';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { toRailNodes, nodeState } from '../../lib/irToCarveNodes.ts';
import type { CarveNode } from '../../lib/irToCarveNodes.ts';
import { StatusBar } from '../assignLoop/parts/StatusBar.tsx';
import type { RemovedItem } from '../assignLoop/parts/StatusBar.tsx';
import { DepBanner } from '../assignLoop/parts/DepBanner.tsx';
import type { DepNode } from '../assignLoop/parts/DepBanner.tsx';
import { Rail } from '../assignLoop/parts/Rail.tsx';
import { Inspector } from '../assignLoop/parts/Inspector.tsx';
import { InfoView } from '../assignLoop/parts/InfoView.tsx';
import { InfoIcon } from '../assignLoop/parts/carveShared.tsx';
import { ConfirmDialog } from '../assignLoop/parts/ConfirmDialog.tsx';
import { useHoverInfoStore } from '../../stores/hoverInfoStore.ts';
import { collectCharContributors } from '@keyboard-studio/engine';
import type { CharContributors } from '@keyboard-studio/engine';

/** Pending cascade-delete state — set when the user clicks a cross-wired chip. */
interface PendingCascade {
  gid: string;
  targetChar: string;
  contributors: CharContributors;
}

interface CarveGalleryProps {
  onComplete: () => void;
  onBack?: (() => void) | undefined;
}

export function CarveGallery({ onComplete, onBack }: CarveGalleryProps) {
  const ir = useWorkingCopyStore((s) => s.ir);
  const removalCapabilities = useWorkingCopyStore((s) => s.removalCapabilities);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted);
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);
  const deleteItem = useWorkingCopyStore((s) => s.deleteItem);
  const restoreItem = useWorkingCopyStore((s) => s.restoreItem);
  const restoreAll = useWorkingCopyStore((s) => s.restoreAll);
  const keepAll = useWorkingCopyStore((s) => s.keepAll);

  const cascadeDelete = useWorkingCopyStore((s) => s.cascadeDelete);

  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);

  // Clear stale hover info when CarveGallery unmounts (e.g. navigating away).
  useEffect(() => () => clearInfo(), [clearInfo]);

  const nodes = useMemo(() => (ir ? toRailNodes(ir, removalCapabilities) : []), [ir, removalCapabilities]);

  // Gate: show the "all clear" screen only when ALL of the following hold:
  //   1. Track 1 (adapting a base) — Track 2 authors know their own keyboard and want to review it.
  //   2. No recognised patterns, user stores, or raw fragments — nothing complex to carve.
  //   3. At most one plain group AND that group has ≤ 20 displayable glyphs — a truly small keyboard.
  //      Arabic / Ethiopic / CJK keyboards with hundreds of rules in "main" must go to the full carver.
  const isSimple = useMemo(() => {
    if (instantiationMode === 'adapt-existing') return false;
    if (nodes.some((n) => n.kind === 'pattern' || n.kind === 'store' || n.kind === 'raw')) return false;
    const groups = nodes.filter((n) => n.kind === 'group');
    if (groups.length > 1) return false;
    const totalGlyphs = groups.reduce((sum, g) => sum + (g.glyphs?.length ?? 0), 0);
    return totalGlyphs <= 20;
  }, [nodes, instantiationMode]);
  const [forceOpen, setForceOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(() => null);
  const selectedNode = useMemo<CarveNode | undefined>(
    () => nodes.find((n) => n.nodeId === selectedId) ?? nodes[0],
    [nodes, selectedId],
  );

  // -- Cascade-delete state ----------------------------------------------------
  const [pendingCascade, setPendingCascade] = useState<PendingCascade | null>(null);

  // Handlers for Rail/Inspector callbacks
  const handleSetManyGlyphs = useCallback((gids: string[], off: boolean) => {
    gids.forEach((gid) => { if (off) { deleteItem(gid); } else { restoreItem(gid); } });
  }, [deleteItem, restoreItem]);

  const handleToggleNode = useCallback((nodeId: string, off: boolean) => {
    if (off) { deleteNode(nodeId); } else { restoreNode(nodeId); }
  }, [deleteNode, restoreNode]);

  const handleToggleGlyph = useCallback((gid: string) => {
    if (isItemDeleted(gid)) { restoreItem(gid); } else { deleteItem(gid); }
  }, [isItemDeleted, restoreItem, deleteItem]);

  /**
   * Cascade-delete handler — called when the user clicks a chip body.
   *
   * Asks the engine (collectCharContributors) for every place the chip's output
   * character is produced, then:
   *  - Only the clicked producer (single contributor, nothing blocked) → plain
   *    item toggle, no dialog (matches the pre-existing single-glyph behavior).
   *  - Produced in more than one place (cross-wired across group / pattern /
   *    store slot) → open ConfirmDialog. Primary = cascadeDelete everywhere;
   *    secondary = toggle only this gid.
   */
  const handleCascadeDelete = useCallback((gid: string) => {
    // Resolve the output character for this gid from the current nodes list.
    let targetChar: string | undefined;
    for (const node of nodes) {
      if (!node.glyphs) continue;
      const glyph = node.glyphs.find((g) => g.gid === gid);
      if (glyph) { targetChar = glyph.ch; break; }
    }

    // Glyph not found for this gid → do nothing rather than toggle an untracked
    // id (which would write a deletion that no chip reflects and can't be undone).
    if (targetChar === undefined) return;

    // No IR to analyse → fall back to a plain single-glyph toggle.
    if (ir == null) {
      handleToggleGlyph(gid);
      return;
    }

    const contributors: CharContributors = collectCharContributors(ir, targetChar);
    const contributorCount = contributors.ruleNodeIds.length + contributors.storeSlotIds.length;

    // Produced in only one place (or unresolved) → plain toggle, no dialog.
    if (contributorCount <= 1 && contributors.blocked.length === 0) {
      handleToggleGlyph(gid);
      return;
    }

    // Cross-wired → confirm removing everywhere.
    setPendingCascade({ gid, targetChar, contributors });
  }, [nodes, ir, handleToggleGlyph]);

  const handleCascadePrimary = useCallback(() => {
    if (!pendingCascade) return;
    cascadeDelete(pendingCascade.contributors.ruleNodeIds, pendingCascade.contributors.storeSlotIds);
    setPendingCascade(null);
  }, [pendingCascade, cascadeDelete]);

  const handleCascadeCancel = useCallback(() => {
    // Cancel — do nothing. Also the target for Escape / backdrop click, so a
    // dismissed dialog never leaves a half-cut character behind. Removing the
    // character from only one of its wired locations is intentionally NOT
    // offered: it would leave the broken cross-references this cascade exists
    // to prevent.
    setPendingCascade(null);
  }, []);

  // Kept / total counts
  const { kept, total } = useMemo(() => {
    let t = 0, k = 0;
    nodes.forEach((node) => {
      if (node.glyphs) {
        t += node.glyphs.length;
        k += node.glyphs.filter((g) => !isItemDeleted(g.gid)).length;
      }
    });
    return { kept: k, total: t };
  }, [nodes, deletedItemIds, isItemDeleted]);

  // Removed list for StatusBar
  const removedList = useMemo<RemovedItem[]>(() => {
    const list: RemovedItem[] = [];
    const fullOffIds = new Set<string>();

    nodes.forEach((node) => {
      if (node.kind !== 'pattern' && node.kind !== 'group') return;
      if (nodeState(node, isItemDeleted, isDeleted) === 'off') {
        fullOffIds.add(node.nodeId);
        list.push({ type: 'node', id: node.nodeId, kind: node.kind, label: node.name, count: node.glyphs?.length ?? 0, glyphIds: node.glyphs?.map((g) => g.gid) });
      }
    });
    nodes.forEach((node) => {
      if (node.kind !== 'store' && node.kind !== 'raw') return;
      if (isDeleted(node.nodeId)) {
        list.push({ type: 'node', id: node.nodeId, kind: node.kind, label: node.name, count: 1 });
      }
    });
    nodes.forEach((node) => {
      if (!node.glyphs) return;
      if (fullOffIds.has(node.nodeId)) return;
      node.glyphs.forEach((glyph) => {
        if (!deletedItemIds.has(glyph.gid)) return;
        list.push({ type: 'item', id: glyph.gid, ch: glyph.ch, keys: glyph.keys, nodeName: node.name });
      });
    });
    return list;
  }, [nodes, deletedItemIds, deletedNodeIds, isItemDeleted, isDeleted]);

  const handleRestore = useCallback((item: RemovedItem) => {
    if (item.type === 'item') { restoreItem(item.id); return; }
    if (item.glyphIds) { item.glyphIds.forEach((gid) => restoreItem(gid)); restoreNode(item.id); }
    else { restoreNode(item.id); }
  }, [restoreItem, restoreNode]);

  // DepBanner — orphaned patterns + newly-unused stores
  const { orphanedNodes, unusedStoreNodes } = useMemo(() => {
    const orphaned: DepNode[] = [];
    const unusedStores: DepNode[] = [];
    nodes.forEach((node) => {
      if ((node.kind === 'pattern' || node.kind === 'group') && !isDeleted(node.nodeId) && nodeState(node, isItemDeleted, isDeleted) === 'off') {
        orphaned.push({ nodeId: node.nodeId, name: node.name });
      }
      if (node.kind === 'store' && node.referencedByNodeId !== undefined && !isDeleted(node.nodeId)) {
        const refNode = nodes.find((n) => n.nodeId === node.referencedByNodeId);
        if (refNode && nodeState(refNode, isItemDeleted, isDeleted) === 'off') {
          unusedStores.push({ nodeId: node.nodeId, name: node.name });
        }
      }
      // Stores orphaned by any()/index() consumers — all referencing patterns AND groups are now off
      if (
        node.kind === 'store' &&
        node.referencedByNodeId === undefined &&
        !isDeleted(node.nodeId) &&
        node.storeUsage !== undefined &&
        (node.storeUsage.patternRefs.length > 0 || node.storeUsage.groupRefs.length > 0) &&
        node.storeUsage.patternRefs.every((r) => {
          const pNode = nodes.find((n) => n.nodeId === r.patternId);
          return pNode ? nodeState(pNode, isItemDeleted, isDeleted) === 'off' : isDeleted(r.patternId);
        }) &&
        node.storeUsage.groupRefs.every((r) => {
          const gNode = nodes.find((n) => n.nodeId === r.groupId);
          return gNode ? nodeState(gNode, isItemDeleted, isDeleted) === 'off' : isDeleted(r.groupId);
        })
      ) {
        unusedStores.push({ nodeId: node.nodeId, name: node.name });
      }
    });
    return { orphanedNodes: orphaned, unusedStoreNodes: unusedStores };
  }, [nodes, deletedItemIds, deletedNodeIds, isItemDeleted, isDeleted]);

  if (!ir) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
        <p style={{ fontSize: 14, color: 'var(--app-text-muted)' }}>Loading keyboard…</p>
      </div>
    );
  }

  const hasRawFragments = ir.raw.length > 0;

  // Gate screen — shown for simple keyboards with nothing complex to carve.
  // No longer gated on hasRawFragments: isSimple already returns false whenever
  // any raw-kind node exists, so the gate screen is naturally suppressed for
  // fragment-bearing keyboards without a redundant guard here.
  if (isSimple && !forceOpen) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)', gap: 24, padding: '0 32px', textAlign: 'center' }}>
        <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={12} cy={12} r={10} />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <div>
          <h2 style={{ margin: '0 0 8px', font: "500 22px/1.15 'Playfair Display', serif", color: 'var(--app-text)' }}>
            Your rules look good
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--app-text-muted)', maxWidth: 400, lineHeight: 1.6 }}>
            This keyboard uses standard rules in a single group — there's nothing complex to review or remove.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => {
              const mainGroup = nodes.find((n) => n.kind === 'group' && n.name === 'main')
                ?? nodes.find((n) => n.kind === 'group');
              if (mainGroup) setSelectedId(mainGroup.nodeId);
              setForceOpen(true);
            }}
            style={{ font: '600 13.5px var(--app-font)', cursor: 'pointer', color: 'var(--app-accent-text)', background: 'var(--app-surface-2)', border: '1px solid var(--app-border-strong)', borderRadius: 9, padding: '10px 20px' }}
          >
            Open rule carver anyway
          </button>
          <button
            onClick={() => { keepAll(); onComplete(); }}
            style={{ font: '600 13.5px var(--app-font)', cursor: 'pointer', color: '#fff', background: 'var(--app-accent)', border: 'none', borderRadius: 9, padding: '10px 22px' }}
          >
            Skip Rule Carver →
          </button>
        </div>
        {onBack !== undefined && (
          <button onClick={onBack} style={{ font: '13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-subtle)', background: 'transparent', border: 'none', marginTop: 4 }}>
            ← Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* Raw-fragment note — informational only; removals apply normally */}
      {hasRawFragments && (
        <div
          role="note"
          aria-label="Advanced rule blocks preserved"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 22px', background: 'var(--accent-bg)', borderBottom: '1px solid color-mix(in srgb, var(--app-accent) 35%, transparent)', fontSize: 13, color: 'var(--app-text-muted)', lineHeight: 1.5 }}
        >
          <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--app-accent)', display: 'inline-flex' }}><InfoIcon size={14} /></span>
          <span>
            This keyboard contains {ir.raw.length} advanced rule block{ir.raw.length !== 1 ? 's' : ''} the editor preserves as-is. Removals you make here are applied normally — the preserved blocks are left unchanged.
          </span>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}>
        {onBack !== undefined && (
          <button
            onClick={onBack}
            onMouseEnter={() => setInfo({ kind: 'text', title: 'Back', body: 'Return to the previous step.' })}
            onFocus={() => setInfo({ kind: 'text', title: 'Back', body: 'Return to the previous step.' })}
            onMouseLeave={clearInfo}
            onBlur={clearInfo}
            style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: 'none', padding: '4px 0', whiteSpace: 'nowrap' }}
          >
            ← Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 10.5px/1 var(--app-font)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--app-text-subtle)' }}>
            Phase D · Carve
          </div>
          <h1 style={{ margin: '6px 0 0', font: "500 23px/1.1 'Playfair Display', serif", color: 'var(--app-text)' }}>
            Review your keyboard's rules
          </h1>
        </div>
        <button
          onClick={() => setInfoOpen((v) => { if (v) clearInfo(); return !v; })}
          aria-pressed={infoOpen}
          aria-label={infoOpen ? 'Hide info panel' : 'Show info panel'}
          onMouseEnter={() => setInfo({ kind: 'text', title: 'Info panel', body: 'Show or hide this panel. It describes whatever your cursor is over.' })}
          onFocus={() => setInfo({ kind: 'text', title: 'Info panel', body: 'Show or hide this panel. It describes whatever your cursor is over.' })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', borderRadius: 8, padding: '7px 13px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, marginRight: 4, background: infoOpen ? 'var(--app-accent)' : 'transparent', color: infoOpen ? '#fff' : 'var(--app-text-muted)', border: infoOpen ? '1px solid var(--app-accent)' : '1px solid var(--app-border-strong)', fontWeight: infoOpen ? 700 : 600 }}
        >
          <InfoIcon size={14} />
          Info
        </button>
        <button
          onClick={() => { keepAll(); onComplete(); }}
          onMouseEnter={() => setInfo({ kind: 'text', title: 'Skip carving', body: 'Keep every rule and continue without removing anything.' })}
          onFocus={() => setInfo({ kind: 'text', title: 'Skip carving', body: 'Keep every rule and continue without removing anything.' })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '7px 13px', whiteSpace: 'nowrap', marginRight: 6 }}
        >
          Skip
        </button>
        <button
          onClick={onComplete}
          onMouseEnter={() => setInfo({ kind: 'text', title: 'Continue', body: 'Save your changes and move to the next step.' })}
          onFocus={() => setInfo({ kind: 'text', title: 'Continue', body: 'Save your changes and move to the next step.' })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: '#fff', background: 'var(--app-accent)', border: 'none', borderRadius: 8, padding: '9px 18px' }}
        >
          Continue →
        </button>
      </div>

      {/* Status bar */}
      <StatusBar
        kept={kept}
        total={total}
        removedList={removedList}
        onRestore={handleRestore}
        onRestoreAll={restoreAll}
      />

      {/* Dependency banner */}
      <DepBanner
        orphanedNodes={orphanedNodes}
        unusedStoreNodes={unusedStoreNodes}
        onRemoveNode={(nodeId) => handleToggleNode(nodeId, true)}
      />

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Rail
          nodes={nodes}
          selectedId={selectedNode?.nodeId ?? null}
          onSelect={setSelectedId}
          isItemDeleted={isItemDeleted}
          isDeleted={isDeleted}
          onSetManyGlyphs={handleSetManyGlyphs}
          onToggleNode={handleToggleNode}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Inspector
            node={selectedNode}
            nodes={nodes}
            isItemDeleted={isItemDeleted}
            onToggleGlyph={handleToggleGlyph}
            onSetManyGlyphs={handleSetManyGlyphs}
            isDeleted={isDeleted}
            onToggleNode={handleToggleNode}
            onSelectNode={setSelectedId}
            onCascadeDelete={handleCascadeDelete}
          />
          {infoOpen && <InfoView />}
        </div>
      </div>

      {/* Cascade-delete confirmation dialog */}
      {pendingCascade !== null && (
        <ConfirmDialog
          open={pendingCascade !== null}
          title={`Remove "${pendingCascade.targetChar}" everywhere?`}
          body={
            <div>
              <p style={{ margin: '0 0 10px' }}>
                This character appears in multiple places. Removing it everywhere keeps
                the keyboard consistent; removing it from just one place may leave
                broken references.
              </p>
              {pendingCascade.contributors.storeSlotIds.length > 0 && (
                <p style={{ margin: '0 0 10px' }}>
                  Note: the key or sequence that triggers this character will still
                  exist, but will now produce nothing.
                </p>
              )}
              <ul
                aria-label="Locations affected"
                style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13 }}
              >
                {pendingCascade.contributors.locations.map((loc, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <b style={{ textTransform: 'capitalize' }}>{loc.kind}</b>
                    {': '}
                    <span style={{ fontFamily: 'var(--app-font-mono)' }}>{loc.label}</span>
                  </li>
                ))}
              </ul>
              {pendingCascade.contributors.blocked.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--sil-orange) 10%, var(--app-surface))',
                    border: '1px solid color-mix(in srgb, var(--sil-orange) 40%, transparent)',
                    fontSize: 12,
                    color: 'var(--sil-orange-dark)',
                  }}
                >
                  <b>Cannot be removed from:</b>{' '}
                  {pendingCascade.contributors.blocked.map((b, i) => (
                    <span key={i}>
                      {b.label} ({b.reason}){i < pendingCascade.contributors.blocked.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          }
          primaryLabel="Yes, remove everywhere"
          secondaryLabel="Cancel"
          onPrimary={handleCascadePrimary}
          onSecondary={handleCascadeCancel}
        />
      )}
    </div>
  );
}
