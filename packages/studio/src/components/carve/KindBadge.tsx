export type CardKind = 'pattern' | 'group' | 'store' | 'raw';

const KIND_COLOR: Record<CardKind, string> = {
  pattern: '#5aa7f0',
  group:   '#6fbf4d',
  store:   '#be86bb',
  raw:     '#ec6b63',
};

const KIND_LABEL: Record<CardKind, string> = {
  pattern: 'Pattern',
  group:   'Group',
  store:   'Store',
  raw:     'Advanced',
};

interface KindBadgeProps { kind: CardKind }

export function KindBadge({ kind }: KindBadgeProps) {
  const c = KIND_COLOR[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 999,
      font: '600 11px/1.4 var(--ui)', letterSpacing: '.06em', textTransform: 'uppercase',
      color: c,
      background: `color-mix(in srgb, ${c} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
    }}>
      {KIND_LABEL[kind]}
    </span>
  );
}

export { KIND_COLOR };
