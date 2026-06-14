import type { IRStore } from '@keyboard-studio/contracts';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { CarveActions } from './CarveActions.tsx';
import { storeCharSample } from '../../lib/carveUtils.ts';
import { makeCardStyle, makeHeadingStyle } from '../../lib/carveStyles.ts';

interface StoreCardProps {
  store: IRStore;
}

export function StoreCard({ store }: StoreCardProps) {
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted(store.nodeId));

  const sample = storeCharSample(store);

  const cardStyle = makeCardStyle(isDeleted);
  const headingStyle = makeHeadingStyle(isDeleted);

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
