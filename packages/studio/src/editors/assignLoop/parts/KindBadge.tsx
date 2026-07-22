import { useLingui } from "@lingui/react/macro";
import type { CardKind } from '../../../lib/irToCarveNodes.ts';
export type { CardKind } from '../../../lib/irToCarveNodes.ts';

export const KIND_COLOR: Record<CardKind, string> = {
  pattern: '#6fbbd4',
  group:   '#f18407',
  store:   '#8b5cc4',
  raw:     '#b90529',
};

// Chrome (human-readable category labels) — built per-render from t() since
// this needs an active useLingui() context; see buildKindLabel below.
function buildKindLabel(
  kind: CardKind,
  t: (descriptor: { id: string; message: string }) => string,
): string {
  switch (kind) {
    case 'pattern': return t({ id: "editor.assignLoop.kindBadge.pattern", message: "Pattern" });
    case 'group': return t({ id: "editor.assignLoop.kindBadge.group", message: "Group" });
    case 'store': return t({ id: "editor.assignLoop.kindBadge.store", message: "Store" });
    case 'raw': return t({ id: "editor.assignLoop.kindBadge.raw", message: "Advanced" });
    default: return kind;
  }
}

interface KindBadgeProps { kind: CardKind }

export function KindBadge({ kind }: KindBadgeProps) {
  const { t } = useLingui();
  const color = KIND_COLOR[kind];
  const label = buildKindLabel(kind, t);
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
