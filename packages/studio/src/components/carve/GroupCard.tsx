import type { IRGroup } from '@keyboard-studio/contracts';
import { useIRStore } from '../../stores/irStore.ts';
import { CarveActions } from './CarveActions.tsx';
import { sampleGroupChars } from '../../lib/carveUtils.ts';

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
