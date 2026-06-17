import { useState, useMemo, useCallback } from 'react';
import { useWorkingCopyStore } from '../stores/workingCopyStore.ts';
import { PatternCard } from './carve/PatternCard.tsx';
import { GroupCard } from './carve/GroupCard.tsx';
import { StoreCard } from './carve/StoreCard.tsx';
import { RawFragmentCard } from './carve/RawFragmentCard.tsx';
import { KindBadge } from './carve/KindBadge.tsx';
import type { KeyboardIR } from '@keyboard-studio/contracts';

interface CarveGalleryProps {
  onComplete: () => void;
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Flagging — stub for v1. Returns undefined always; all keyboards land on
// EmptyState. The inference pass is a separate future issue.
// ---------------------------------------------------------------------------
function flagForNode(_nodeId: string, _ir: KeyboardIR): string | undefined {
  return undefined;
}

// ---------------------------------------------------------------------------
// How many rules a deleted node represents (for the header count)
// ---------------------------------------------------------------------------
function ruleCount(ir: KeyboardIR, nodeId: string): number {
  const pattern = ir.recognizedPatterns.find((p) => p.id === nodeId);
  if (pattern) return Math.max(1, pattern.ownedNodes?.length ?? 1);
  const group = ir.groups.find((g) => g.nodeId === nodeId);
  if (group) return group.rules.filter((r) => r.ownedByPattern === undefined).length;
  return 1;
}

export function CarveGallery({ onComplete, onBack }: CarveGalleryProps) {
  const ir = useWorkingCopyStore((s) => s.ir);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const keepAll = useWorkingCopyStore((s) => s.keepAll);
  const restoreAll = useWorkingCopyStore((s) => s.restoreAll);
  const undoDelete = useWorkingCopyStore((s) => s.undoDelete);

  const [view, setView] = useState<'flagged' | 'full'>('flagged');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showInternals, setShowInternals] = useState(false);

  const removedCount = useMemo(() => {
    if (!ir) return 0;
    let total = 0;
    deletedNodeIds.forEach((id) => { total += ruleCount(ir, id); });
    deletedItemIds.forEach((id) => {
      if (!deletedNodeIds.has(id.split('#')[0] ?? id)) total += 1;
    });
    return total;
  }, [ir, deletedNodeIds, deletedItemIds]);

  const handleSkip = useCallback(() => { keepAll(); onComplete(); }, [keepAll, onComplete]);

  if (!ir) {
    return (
      <div style={{ padding: '1.5rem', color: 'var(--text)' }}>
        <p>Loading keyboard...</p>
        {onBack !== undefined && (
          <button type="button" onClick={onBack} style={btnSecondary}>← Back</button>
        )}
      </div>
    );
  }

  const recognizedPatterns = ir.recognizedPatterns.filter((p) => p.origin === 'recognized');
  const unrecognizedGroups = ir.groups.filter((g) => g.rules.some((r) => r.ownedByPattern === undefined));
  const nonSystemStores = ir.stores.filter((s) => !s.isSystem);

  const totalNodes = recognizedPatterns.length + unrecognizedGroups.length + nonSystemStores.length + ir.raw.length;
  if (totalNodes === 0) {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 24px 120px' }}>
        <PageHeader removedCount={0} menuOpen={false} setMenuOpen={() => {}}
          ir={ir} deletedNodeIds={deletedNodeIds} deletedItemIds={deletedItemIds}
          restoreAll={restoreAll} undoDelete={undoDelete} />
        <div style={{ padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: '0.9rem' }}>
          Nothing to review — these are standard keys.
        </div>
        <Footer onComplete={onComplete} onBack={onBack} onSkip={handleSkip} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 24px 120px' }}>
      <PageHeader
        removedCount={removedCount}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        ir={ir}
        deletedNodeIds={deletedNodeIds}
        deletedItemIds={deletedItemIds}
        restoreAll={restoreAll}
        undoDelete={undoDelete}
      />

      <main style={{ paddingTop: 14 }}>
        {view === 'flagged' ? (
          <FlaggedView onToggle={() => setView('full')} />
        ) : (
          <FullView
            ir={ir}
            recognizedPatterns={recognizedPatterns}
            unrecognizedGroups={unrecognizedGroups}
            nonSystemStores={nonSystemStores}
            showInternals={showInternals}
            setShowInternals={setShowInternals}
            onToggle={() => setView('flagged')}
          />
        )}

        <Footer onComplete={onComplete} onBack={onBack} onSkip={handleSkip} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticky page header
// ---------------------------------------------------------------------------
interface PageHeaderProps {
  removedCount: number;
  menuOpen: boolean;
  setMenuOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  ir: KeyboardIR;
  deletedNodeIds: Set<string>;
  deletedItemIds: Set<string>;
  restoreAll: () => void;
  undoDelete: () => void;
}

function PageHeader({ removedCount, menuOpen, setMenuOpen, ir, deletedNodeIds, deletedItemIds, restoreAll }: PageHeaderProps) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 5,
      background: 'var(--bg)',
      paddingTop: 26, paddingBottom: 14, marginBottom: 8,
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 11.5px/1 var(--ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Phase D · Carve
          </div>
          <h1 style={{ margin: '7px 0 0', font: '500 25px/1.15 var(--display)', color: 'var(--text)' }}>
            Review your keyboard's rules
          </h1>
        </div>
      </div>

      <div style={{ marginTop: 10, position: 'relative' }}>
        {removedCount > 0 ? (
          <button
            onClick={() => setMenuOpen((o) => !o)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 0, background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            <span style={{ font: '600 16px var(--ui)', color: 'var(--text)' }}>
              <b style={{ fontWeight: 700 }}>{removedCount}</b> rule{removedCount !== 1 ? 's' : ''} marked for removal
            </span>
            <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>· reversible until you continue</span>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : (
          <div style={{ fontSize: 15, color: 'var(--muted)' }}>
            You're adapting a base keyboard. Remove rules that don't fit your language before the survey begins.
          </div>
        )}
        {menuOpen && removedCount > 0 && (
          <RemovedMenu
            ir={ir}
            deletedNodeIds={deletedNodeIds}
            deletedItemIds={deletedItemIds}
            restoreAll={restoreAll}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Flagged view — no flagging in v1, always shows EmptyState
// ---------------------------------------------------------------------------
function FlaggedView({ onToggle }: { onToggle: () => void }) {
  return (
    <>
      <EmptyState />
      <ToggleBar expanded={false} onClick={onToggle} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state — shown when nothing is flagged
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div style={{
      padding: '40px 32px', textAlign: 'center',
      background: 'var(--card)',
      border: '1px solid var(--border)', borderTop: '3px solid var(--green)',
      borderRadius: 12,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 56, height: 56, borderRadius: 14, marginBottom: 18,
        color: 'var(--green-hover)',
        background: 'color-mix(in srgb, var(--green) 16%, transparent)',
        border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)',
      }}>
        <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
        </svg>
      </span>
      <div style={{ font: '500 23px/1.2 var(--display)', color: 'var(--text)' }}>Your keyboard looks clean.</div>
      <div style={{ fontSize: 15, color: 'var(--muted)', marginTop: 8, maxWidth: 440, margin: '8px auto 0', lineHeight: 1.6 }}>
        Every rule fits your language's script — there's nothing we'd suggest removing. You're ready to continue to the survey.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full view — all four card types; system internals collapsed
// ---------------------------------------------------------------------------
interface FullViewProps {
  ir: KeyboardIR;
  recognizedPatterns: KeyboardIR['recognizedPatterns'];
  unrecognizedGroups: KeyboardIR['groups'];
  nonSystemStores: KeyboardIR['stores'];
  showInternals: boolean;
  setShowInternals: (v: boolean) => void;
  onToggle: () => void;
}

function FullView({ ir, recognizedPatterns, unrecognizedGroups, nonSystemStores, showInternals, setShowInternals, onToggle }: FullViewProps) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18,
        padding: '12px 15px',
        background: 'var(--card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--green)',
        borderRadius: 10,
      }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--green-hover)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }}>
          <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
        </svg>
        <div style={{ flex: 1, fontSize: 14, color: 'var(--muted)' }}>
          <b style={{ color: 'var(--text)', fontWeight: 600 }}>Nothing looks out of place.</b>{' '}
          Every rule fits your language's script — review below and remove anything you don't need, or just continue.
        </div>
      </div>

      <ToggleBar expanded={true} onClick={onToggle} />

      {recognizedPatterns.length > 0 && (
        <Section label="Patterns" count={recognizedPatterns.length}>
          {recognizedPatterns.map((p) => (
            <PatternCard key={p.id} pattern={p} ir={ir} flag={flagForNode(p.id, ir)} />
          ))}
        </Section>
      )}

      {unrecognizedGroups.length > 0 && (
        <Section label="Groups" count={unrecognizedGroups.length}>
          {unrecognizedGroups.map((g) => (
            <GroupCard key={g.nodeId} group={g} flag={flagForNode(g.nodeId, ir)} />
          ))}
        </Section>
      )}

      {(nonSystemStores.length > 0 || ir.raw.length > 0) && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card)' }}>
          <button
            onClick={() => setShowInternals(!showInternals)}
            style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              style={{ flex: '0 0 auto', transform: showInternals ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ font: '600 15px var(--ui)' }}>
                System internals · {nonSystemStores.length + ir.raw.length}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 1 }}>
                Lookup tables and advanced rules that power the keyboard. You'll normally leave these alone.
              </div>
            </div>
            {!showInternals && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 11.5px var(--ui)', color: 'var(--amber)', flex: '0 0 auto' }}>
                <WarnIcon size={12} /> usually keep
              </span>
            )}
          </button>
          {showInternals && (
            <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--border)' }}>
              {nonSystemStores.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <SectionHeader label="Stores" count={nonSystemStores.length} />
                  {nonSystemStores.map((s) => (
                    <StoreCard key={s.nodeId} store={s} ir={ir} flag={flagForNode(s.nodeId, ir)} />
                  ))}
                </div>
              )}
              {ir.raw.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <SectionHeader label="Advanced" count={ir.raw.length} />
                  {ir.raw.map((f) => (
                    <RawFragmentCard key={f.nodeId} fragment={f} flag={flagForNode(f.nodeId, ir)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <SectionHeader label={label} count={count} />
      {children}
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 11px', paddingBottom: 7, borderBottom: '1px solid var(--border)' }}>
      <span style={{ font: '600 12px/1 var(--ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--border-strong)' }}>{count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle bar — switches between flagged and full views
// ---------------------------------------------------------------------------
function ToggleBar({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      width: '100%', marginTop: 4, marginBottom: 18, padding: 11,
      background: 'transparent', border: '1px dashed var(--border-strong)',
      borderRadius: 10, color: 'var(--accent)', font: '600 14px var(--ui)', cursor: 'pointer',
    }}>
      {expanded ? 'Show only flagged rules' : 'Show all rules'}
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Removed menu dropdown
// ---------------------------------------------------------------------------
interface RemovedMenuProps {
  ir: KeyboardIR;
  deletedNodeIds: Set<string>;
  deletedItemIds: Set<string>;
  restoreAll: () => void;
  onClose: () => void;
}

function RemovedMenu({ ir, deletedNodeIds, deletedItemIds, restoreAll, onClose }: RemovedMenuProps) {
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);

  const nodeEntries = Array.from(deletedNodeIds).map((id) => {
    const pattern = ir.recognizedPatterns.find((p) => p.id === id);
    const group = ir.groups.find((g) => g.nodeId === id);
    const store = ir.stores.find((s) => s.nodeId === id);
    const raw = ir.raw.find((f) => f.nodeId === id);
    const label = pattern?.title ?? group?.name ?? store?.name ?? 'Advanced rule';
    const kind: 'pattern' | 'group' | 'store' | 'raw' = pattern ? 'pattern' : group ? 'group' : store ? 'store' : 'raw';
    const count = ruleCount(ir, id);
    return { id, label, kind, count };
  });

  const itemOnlyCount = Array.from(deletedItemIds).filter((id) => !deletedNodeIds.has(id.split('#').at(0) ?? id)).length;
  const totalCount = nodeEntries.length + itemOnlyCount;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 10px)', left: 0, zIndex: 41,
        width: 404, maxWidth: '92vw',
        background: 'var(--card)', border: '1px solid var(--border-strong)',
        borderRadius: 12, boxShadow: '0 16px 44px rgba(0,0,0,.55)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 13px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ font: '600 12px/1 var(--ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Marked for removal · {totalCount}
          </span>
          <button onClick={restoreAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--accent)', font: '600 13px var(--ui)', cursor: 'pointer' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
            </svg>
            Restore all
          </button>
        </div>
        <div style={{ maxHeight: 344, overflowY: 'auto', padding: 6 }}>
          {nodeEntries.map((entry) => (
            <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px' }}>
              <KindBadge kind={entry.kind} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{entry.count} rule{entry.count !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => restoreNode(entry.id)} style={keepBtn}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Keep
              </button>
            </div>
          ))}
          {itemOnlyCount > 0 && (
            <div style={{ padding: '7px 8px', fontSize: 13.5, color: 'var(--muted)' }}>
              +{itemOnlyCount} individual character{itemOnlyCount !== 1 ? 's' : ''} marked for removal
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function Footer({ onComplete, onBack, onSkip }: { onComplete: () => void; onBack?: (() => void) | undefined; onSkip: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {onBack !== undefined && (
          <button onClick={onBack} style={btnSecondary}>← Back</button>
        )}
        <button onClick={onSkip} style={btnSecondary}>Keep everything — continue</button>
      </div>
      <button onClick={onComplete} style={btnPrimary}>
        Continue
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared icon
// ---------------------------------------------------------------------------
function WarnIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared button styles
// ---------------------------------------------------------------------------
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 20px',
  background: 'var(--primary)', border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 8, color: '#fff', font: '600 15px var(--ui)', cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '8px 14px',
  background: 'var(--card)', border: '1px solid var(--border-strong)',
  borderRadius: 8, color: 'var(--text)', font: '600 13.5px var(--ui)',
  cursor: 'pointer', whiteSpace: 'nowrap',
};

const keepBtn: React.CSSProperties = {
  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '5px 10px',
  background: 'color-mix(in srgb, var(--green) 15%, transparent)',
  border: '1px solid color-mix(in srgb, var(--green) 42%, transparent)',
  borderRadius: 7, color: 'var(--green-hover)', font: '600 12.5px var(--ui)', cursor: 'pointer',
};
