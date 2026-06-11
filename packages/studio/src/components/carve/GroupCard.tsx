import type { IRGroup } from '@keyboard-studio/contracts';
import { useIRStore } from '../../stores/irStore.ts';
import { CarveActions } from './CarveActions.tsx';
import { sampleGroupChars } from '../../lib/carveUtils.ts';
import { makeCardStyle, makeHeadingStyle } from '../../lib/carveStyles.ts';

interface GroupCardProps {
  group: IRGroup;
}

export function GroupCard({ group }: GroupCardProps) {
  const isDeleted = useIRStore((s) => s.isDeleted(group.nodeId));

  // Only count rules not already owned by a recognized Pattern card.
  const nonOwnedCount = group.rules.filter((r) => r.ownedByPattern === undefined).length;

  // Group is fully represented by Pattern cards — nothing to show here.
  if (nonOwnedCount === 0) return null;

  const sample = sampleGroupChars(group);

  const cardStyle = makeCardStyle(isDeleted);
  const headingStyle = makeHeadingStyle(isDeleted);

  return (
    <div style={cardStyle}>
      <h3 style={headingStyle}>{group.name}</h3>
      {sample.length > 0 && (
        <div style={{ fontSize: '1.2em', margin: '0.25rem 0', color: '#e6edf3' }}>
          {sample.join('  ')}
        </div>
      )}
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: '#8b949e' }}>
        {nonOwnedCount} rule{nonOwnedCount !== 1 ? 's' : ''}
      </p>
      <CarveActions nodeId={group.nodeId} />
    </div>
  );
}
