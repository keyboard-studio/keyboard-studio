import type { Pattern } from '@keyboard-studio/contracts';
import { useIRStore } from '../../stores/irStore.ts';
import { CarveActions } from './CarveActions.tsx';

interface PatternCardProps {
  pattern: Pattern;
  onEdit?: () => void;
}

export function PatternCard({ pattern, onEdit }: PatternCardProps) {
  // A Pattern instance may not have a nodeId on the Pattern type itself;
  // we use pattern.id as the stable deletion key for recognized patterns.
  const isDeleted = useIRStore((s) => s.isDeleted(pattern.id));

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
      <h3 style={headingStyle}>{pattern.title}</h3>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: '#8b949e' }}>
        {pattern.description ?? 'Recognized keyboard pattern'}
      </p>
      <CarveActions nodeId={pattern.id} {...(onEdit !== undefined ? { onEdit } : {})} />
    </div>
  );
}
