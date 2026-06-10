import type { RawKmnFragment } from '@keyboard-studio/contracts';
import { useIRStore } from '../../stores/irStore.ts';
import { CarveActions } from './CarveActions.tsx';

interface RawFragmentCardProps {
  fragment: RawKmnFragment;
}

export function RawFragmentCard({ fragment }: RawFragmentCardProps) {
  const isDeleted = useIRStore((s) => s.isDeleted(fragment.nodeId));

  const cardStyle: React.CSSProperties = {
    padding: '1rem',
    border: '1px solid #3d2b00',
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
      <h3 style={headingStyle}>Advanced rule (cannot be edited)</h3>
      {/* Show reason via tooltip only — do not expose sourceText in the UI. */}
      <button
        title={fragment.reason}
        style={{ fontSize: '0.85rem', cursor: 'help', background: 'none', border: 'none', color: '#8b949e', padding: 0 }}
        aria-label={`Info: ${fragment.reason}`}
      >
        [i] {fragment.reason}
      </button>
      <CarveActions nodeId={fragment.nodeId} />
    </div>
  );
}
