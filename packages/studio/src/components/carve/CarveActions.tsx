import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';

interface CarveActionsProps {
  nodeId: string;
}

export function CarveActions({ nodeId }: CarveActionsProps) {
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted(nodeId));

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
