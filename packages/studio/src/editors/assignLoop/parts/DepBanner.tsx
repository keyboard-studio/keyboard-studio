import { WarnIcon } from './carveShared.tsx';

export interface DepNode { nodeId: string; name: string }

interface DepBannerProps {
  orphanedNodes: DepNode[];
  unusedStoreNodes: DepNode[];
  onRemoveNode: (nodeId: string) => void;
}

const btnRemove: React.CSSProperties = {
  flexShrink: 0, font: '600 12px var(--app-font)', cursor: 'pointer',
  color: 'var(--sil-orange-dark)', background: 'transparent',
  border: '1px solid color-mix(in srgb, var(--sil-orange) 55%, transparent)',
  borderRadius: 7, padding: '4px 11px', whiteSpace: 'nowrap',
};

interface BannerRow { node: DepNode; message: string; buttonLabel: string }

function BannerItem({ node, message, buttonLabel, onRemove }: BannerRow & { onRemove: (nodeId: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--app-text)' }}>
      <span style={{ color: 'var(--sil-orange-dark)', display: 'inline-flex', flexShrink: 0 }}><WarnIcon size={15} /></span>
      <span style={{ flex: 1 }}>
        <b>{node.name}</b> {message}
      </span>
      <button style={btnRemove} onClick={() => onRemove(node.nodeId)}>
        {buttonLabel}
      </button>
    </div>
  );
}

export function DepBanner({ orphanedNodes, unusedStoreNodes, onRemoveNode }: DepBannerProps) {
  if (orphanedNodes.length === 0 && unusedStoreNodes.length === 0) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 22px',
      background: 'color-mix(in srgb, var(--sil-orange) 7%, var(--app-bg))',
      borderBottom: '1px solid color-mix(in srgb, var(--sil-orange) 35%, transparent)',
    }}>
      {orphanedNodes.map((n) => (
        <BannerItem
          key={n.nodeId}
          node={n}
          message="has no outputs left. Its trigger key will silently swallow the input, blocking the normal keystroke. Remove the rule too to restore default key behavior."
          buttonLabel="Remove trigger key too"
          onRemove={onRemoveNode}
        />
      ))}
      {unusedStoreNodes.map((n) => (
        <BannerItem
          key={n.nodeId}
          node={n}
          message="is no longer referenced and can be removed too."
          buttonLabel="Remove store too"
          onRemove={onRemoveNode}
        />
      ))}
    </div>
  );
}
