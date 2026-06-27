import { useState, useEffect } from 'react';
import { KindBadge } from './KindBadge.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';
import type { CardKind } from './KindBadge.tsx';
import { KeySeq } from './KeySeq.tsx';
import { ChevronIcon, UndoIcon, CheckIcon } from './carveShared.tsx';
import { isCombining } from '../../../lib/irToCarveNodes.ts';

export type RemovedItem =
  | { type: 'node'; id: string; kind: CardKind; label: string; count: number; glyphIds?: string[] | undefined }
  | { type: 'item'; id: string; ch: string; keys: string[]; nodeName?: string | undefined };

interface RemovedMenuProps {
  list: RemovedItem[];
  onRestore: (item: RemovedItem) => void;
  onRestoreAll: () => void;
  onClose: () => void;
}

function RemovedMenu({ list, onRestore, onRestoreAll, onClose }: RemovedMenuProps) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 41,
        width: 400, maxWidth: '92vw',
        background: 'var(--app-surface)', border: '1px solid var(--app-border-strong)',
        borderRadius: 12, boxShadow: '0 16px 44px rgba(20,40,80,.18)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 13px', borderBottom: '1px solid var(--app-border)' }}>
          <span style={{ font: '600 11px/1 var(--app-font)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--app-text-subtle)' }}>
            Removed · {list.length}
          </span>
          <button onClick={onRestoreAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', border: '1px solid var(--app-border-strong)', borderRadius: 7, color: 'var(--app-accent-text)', font: '600 12.5px var(--app-font)', cursor: 'pointer' }}>
            <UndoIcon size={13} /> Restore all
          </button>
        </div>
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
          {list.map((it) => (
            <div key={it.type + ':' + it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px' }}>
              {it.type === 'node' ? (
                <>
                  <KindBadge kind={it.kind} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--app-text)' }}>{it.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--app-text-subtle)' }}>{it.count} character{it.count !== 1 ? 's' : ''}</div>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 34, padding: '0 7px', background: 'var(--app-surface-2)', border: '1px solid var(--app-border)', borderRadius: 7 }}>
                    <span style={{ font: "400 18px/1 'Lora', serif", color: 'var(--app-text)' }}>
                      {isCombining(it.ch) ? '◌' + it.ch : it.ch}
                    </span>
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <KeySeq keys={it.keys} />
                    {it.nodeName !== undefined && <span style={{ fontSize: 12, color: 'var(--app-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nodeName}</span>}
                  </div>
                </>
              )}
              <button onClick={() => onRestore(it)} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: 'var(--sil-green)', border: '1px solid var(--sil-green-dark)', borderRadius: 7, color: '#fff', font: '600 12.5px var(--app-font)', cursor: 'pointer' }}>
                <CheckIcon size={12} /> Keep
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

interface StatusBarProps {
  kept: number;
  total: number;
  removedList: RemovedItem[];
  onRestore: (item: RemovedItem) => void;
  onRestoreAll: () => void;
}

export function StatusBar({ kept, total, removedList, onRestore, onRestoreAll }: StatusBarProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (removedList.length === 0) setOpen(false); }, [removedList.length]);

  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '12px 22px', borderBottom: '1px solid var(--app-border)', background: 'var(--app-surface)' }}>
      <div
        onMouseEnter={() => setInfo({ kind: 'text', title: 'Characters kept', body: 'How many characters you are keeping out of the total in this keyboard.' })}
        onFocus={() => setInfo({ kind: 'text', title: 'Characters kept', body: 'How many characters you are keeping out of the total in this keyboard.' })}
        onMouseLeave={clearInfo}
        onBlur={clearInfo}
      >
        <div style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>
          <b style={{ color: 'var(--app-accent-text)', fontSize: 18 }}>{kept}</b> of {total} characters kept
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--app-text-subtle)', marginTop: 2 }}>
          {total - kept} removed · reversible until you continue
        </div>
      </div>
      <div style={{ marginLeft: 'auto', position: 'relative' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={removedList.length === 0}
          onMouseEnter={() => setInfo({ kind: 'text', title: 'Removed items', body: 'Open this to see what you removed and restore anything you change your mind about.' })}
          onFocus={() => setInfo({ kind: 'text', title: 'Removed items', body: 'Open this to see what you removed and restore anything you change your mind about.' })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 999,
            border: '1px solid ' + (removedList.length > 0 ? 'var(--app-accent)' : 'var(--app-border)'),
            background: removedList.length > 0 ? (open ? 'var(--app-accent-subtle)' : 'var(--app-surface-2)') : 'var(--app-surface-2)',
            cursor: removedList.length > 0 ? 'pointer' : 'default',
            boxShadow: removedList.length > 0 ? '0 0 0 3px color-mix(in srgb, var(--app-accent) 16%, transparent), 0 2px 10px color-mix(in srgb, var(--app-accent) 28%, transparent)' : 'none',
            font: '600 12.5px var(--app-font)',
            color: removedList.length > 0 ? 'var(--app-accent-text)' : 'var(--app-text-subtle)',
            opacity: removedList.length > 0 ? 1 : 0.6,
          }}
        >
          <UndoIcon size={13} />
          {removedList.length > 0 ? <span><b>{removedList.length}</b> removed</span> : 'Nothing removed'}
          {removedList.length > 0 && <ChevronIcon open={open} size={14} />}
        </button>
        {open && removedList.length > 0 && (
          <RemovedMenu list={removedList} onRestore={onRestore} onRestoreAll={onRestoreAll} onClose={() => setOpen(false)} />
        )}
      </div>
    </div>
  );
}
