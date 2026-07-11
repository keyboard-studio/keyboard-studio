import type { CardKind } from '../../../lib/irToCarveNodes.ts';
export type { CardKind } from '../../../lib/irToCarveNodes.ts';

export const KIND_COLOR: Record<CardKind, string> = {
  pattern: '#6fbbd4',
  group:   '#f18407',
  store:   '#8b5cc4',
  raw:     '#b90529',
};

const KIND_LABEL: Record<CardKind, string> = {
  pattern: 'Pattern',
  group:   'Group',
  store:   'Store',
  raw:     'Advanced',
};

interface KindBadgeProps { kind: CardKind }

export function KindBadge({ kind }: KindBadgeProps) {
  const color = KIND_COLOR[kind];
  const label = KIND_LABEL[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      font: '600 10px/1.4 var(--app-font)', letterSpacing: '.08em', textTransform: 'uppercase',
      color,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 38%, transparent)`,
    }}>
      {label}
    </span>
  );
}
