import { useIRStore } from '../../stores/irStore.ts';

interface CarveActionsProps {
  nodeId: string;
  onEdit?: () => void;
}

export function CarveActions({ nodeId, onEdit }: CarveActionsProps) {
  const deleteNode = useIRStore((s) => s.deleteNode);
  const undoDelete = useIRStore((s) => s.undoDelete);
  const isDeleted = useIRStore((s) => s.isDeleted(nodeId));

  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
      {isDeleted ? (
        <button onClick={undoDelete}>Restore</button>
      ) : (
        <button onClick={() => deleteNode(nodeId)}>Delete</button>
      )}
      {onEdit && (
        <button
          aria-disabled
          title="Pattern editing available in the survey step"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
        >
          Edit
        </button>
      )}
    </div>
  );
}
