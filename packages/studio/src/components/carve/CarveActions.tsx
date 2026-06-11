import { useIRStore } from '../../stores/irStore.ts';

interface CarveActionsProps {
  nodeId: string;
}

export function CarveActions({ nodeId }: CarveActionsProps) {
  const deleteNode = useIRStore((s) => s.deleteNode);
  const restoreNode = useIRStore((s) => s.restoreNode);
  const isDeleted = useIRStore((s) => s.isDeleted(nodeId));

  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
      {isDeleted ? (
        <button onClick={() => restoreNode(nodeId)}>Restore</button>
      ) : (
        <button onClick={() => deleteNode(nodeId)}>Delete</button>
      )}
    </div>
  );
}
