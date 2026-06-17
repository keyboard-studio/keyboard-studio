import { useState } from 'react';
import type { Pattern, KeyboardIR } from '@keyboard-studio/contracts';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { CardShell } from './CardShell.tsx';
import { KindBadge, KIND_COLOR } from './KindBadge.tsx';
import { MapChip } from './MapChip.tsx';
import { patternToGlyphs } from '../../lib/irToCarveNodes.ts';

interface PatternCardProps {
  pattern: Pattern;
  ir: KeyboardIR;
  flag?: string | undefined;
}

const PREVIEW = 8;

export function PatternCard({ pattern, ir, flag }: PatternCardProps) {
  const [open, setOpen] = useState(false);
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted(pattern.id));
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);
  const deleteItem = useWorkingCopyStore((s) => s.deleteItem);
  const restoreItem = useWorkingCopyStore((s) => s.restoreItem);

  const glyphs = patternToGlyphs(pattern, ir);
  const shown = open ? glyphs : glyphs.slice(0, PREVIEW);
  const more = glyphs.length - PREVIEW;
  const color = KIND_COLOR.pattern;
  const node = { nodeId: pattern.id, flag, desc: pattern.description };

  const strategyLabel = pattern.strategyId ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 11.5px/1 var(--mono)', color: 'var(--muted)' }}>
      <b style={{ color: 'var(--accent)' }}>{pattern.strategyId}</b>
    </span>
  ) : null;

  return (
    <CardShell
      node={node}
      deleted={isDeleted}
      onDelete={() => deleteNode(pattern.id)}
      onUndo={() => restoreNode(pattern.id)}
      title={pattern.title}
      badge={<><KindBadge kind="pattern" />{strategyLabel}</>}
    >
      {glyphs.length > 0 ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {shown.map((g) => (
              <MapChip
                key={g.gid}
                keys={g.keys}
                ch={g.ch}
                removed={isItemDeleted(g.gid)}
                onToggle={() => isItemDeleted(g.gid) ? restoreItem(g.gid) : deleteItem(g.gid)}
                color={color}
              />
            ))}
          </div>
          {glyphs.length > PREVIEW && (
            <button onClick={() => setOpen((o) => !o)} style={discloseBtn}>
              <ChevronIcon open={open} />
              {open ? 'Show less' : `Show full character map · ${more} more`}
            </button>
          )}
        </>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>{pattern.description}</p>
      )}
    </CardShell>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const discloseBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  marginTop: 10, padding: 0,
  background: 'none', border: 'none',
  color: 'var(--accent)', font: '600 13.5px var(--ui)', cursor: 'pointer',
};
