import type { IRStore } from '@keyboard-studio/contracts';
import { useIRStore } from '../../stores/irStore.ts';
import { CarveActions } from './CarveActions.tsx';
import { storeCharSample } from '../../lib/carveUtils.ts';

interface StoreCardProps {
  store: IRStore;
}

export function StoreCard({ store }: StoreCardProps) {
  // System stores (&NAME, &COPYRIGHT, etc.) are not user-visible content.
  if (store.isSystem) return null;

  const isDeleted = useIRStore((s) => s.isDeleted(store.nodeId));

  const sample = storeCharSample(store);

  const cardStyle: React.CSSProperties = {
    padding: '1rem',
    border: '1px solid #283040',
    borderRadius: '6px',
    background: '#0d1117',
    opacity: isDeleted ? 0.4 : 1,
  };

  const headingStyle: React.CSSProperties = {
    margin: '0 0 0.25rem',
    fontSize: '1rem',
    textDecoration: isDeleted ? 'line-through' : 'none',
    color: '#e6edf3',
  };

  return (
    <div style={cardStyle}>
      <h3 style={headingStyle}>{store.name}</h3>
      {sample && (
        <div style={{ fontSize: '1.1em', margin: '0.25rem 0', color: '#e6edf3' }}>
          {sample}
        </div>
      )}
      <CarveActions nodeId={store.nodeId} />
    </div>
  );
}
