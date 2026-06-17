import { useState } from 'react';
import type { IRGroup } from '@keyboard-studio/contracts';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { CardShell } from './CardShell.tsx';
import { KindBadge, KIND_COLOR } from './KindBadge.tsx';
import { MapChip } from './MapChip.tsx';
import { groupToGlyphs } from '../../lib/irToCarveNodes.ts';
import { ChevronIcon, discloseBtn } from './carveShared.tsx';

interface GroupCardProps {
  group: IRGroup;
  flag?: string | undefined;
}

const PREVIEW = 8;

export function GroupCard({ group, flag }: GroupCardProps) {
  const [open, setOpen] = useState(false);
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted(group.nodeId));
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);
  const deleteItem = useWorkingCopyStore((s) => s.deleteItem);
  const restoreItem = useWorkingCopyStore((s) => s.restoreItem);

  const hasUnownedRules = group.rules.some((r) => r.ownedByPattern === undefined);
  if (!hasUnownedRules) return null;

  const glyphs = groupToGlyphs(group);
  const shown = open ? glyphs : glyphs.slice(0, PREVIEW);
  const color = KIND_COLOR.group;
  const node = { nodeId: group.nodeId, flag };

  const unownedCount = group.rules.filter((r) => r.ownedByPattern === undefined).length;

  return (
    <CardShell
      node={node}
      deleted={isDeleted}
      onDelete={() => deleteNode(group.nodeId)}
      onUndo={() => restoreNode(group.nodeId)}
      title={group.name}
      badge={<KindBadge kind="group" />}
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
              {open ? 'Show less' : `Show all ${glyphs.length} rules`}
            </button>
          )}
        </>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          {unownedCount} rule{unownedCount !== 1 ? 's' : ''} — complex context, cannot be previewed
        </p>
      )}
    </CardShell>
  );
}

