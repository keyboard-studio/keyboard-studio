import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkingCopyStore } from './workingCopyStore.ts';
import { makeTestIR } from '@keyboard-studio/contracts/fixtures';

const reset = () =>
  useWorkingCopyStore.setState({ ir: null, deletedNodeIds: new Set(), deletedItemIds: new Set(), undoStack: [] });

beforeEach(reset);

const ir = makeTestIR([]);

describe('setIR', () => {
  it('populates ir and clears deletion state', () => {
    useWorkingCopyStore.getState().deleteNode('old');
    useWorkingCopyStore.getState().setIR(ir);
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBe(ir);
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('clearIR', () => {
  it('resets ir to null and clears deletion state', () => {
    useWorkingCopyStore.getState().setIR(ir);
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().clearIR();
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBeNull();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('deleteNode', () => {
  it('marks a node as deleted and records it in undoStack', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    const s = useWorkingCopyStore.getState();
    expect(s.isDeleted('n1')).toBe(true);
    expect(s.undoStack).toEqual([{ k: 'n', id: 'n1' }]);
  });

  it('deleting the same node twice pushes two undoStack entries but deduplicates deletedNodeIds', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().deleteNode('n1');
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(2);
    expect(useWorkingCopyStore.getState().deletedNodeIds.size).toBe(1);
  });
});

describe('undoDelete', () => {
  it('is a no-op when undoStack is empty', () => {
    useWorkingCopyStore.getState().undoDelete();
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
  });

  it('restores the most recently deleted node', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().deleteNode('n2');
    useWorkingCopyStore.getState().undoDelete();
    const s = useWorkingCopyStore.getState();
    expect(s.isDeleted('n2')).toBe(false);
    expect(s.isDeleted('n1')).toBe(true);
    expect(s.undoStack).toEqual([{ k: 'n', id: 'n1' }]);
  });
});

describe('restoreNode', () => {
  it('removes a specific node from deletedNodeIds and undoStack', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().deleteNode('n2');
    useWorkingCopyStore.getState().restoreNode('n1');
    const s = useWorkingCopyStore.getState();
    expect(s.isDeleted('n1')).toBe(false);
    expect(s.isDeleted('n2')).toBe(true);
    expect(s.undoStack).toEqual([{ k: 'n', id: 'n2' }]);
  });

  it('is a no-op for a nodeId that was never deleted', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().restoreNode('ghost');
    expect(useWorkingCopyStore.getState().undoStack).toEqual([{ k: 'n', id: 'n1' }]);
  });

  it('removes all occurrences of nodeId from undoStack', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().restoreNode('n1');
    const s = useWorkingCopyStore.getState();
    expect(s.isDeleted('n1')).toBe(false);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('keepAll', () => {
  it('clears all deletions and undoStack while preserving ir', () => {
    useWorkingCopyStore.getState().setIR(ir);
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().deleteNode('n2');
    useWorkingCopyStore.getState().keepAll();
    const s = useWorkingCopyStore.getState();
    expect(s.ir).toBe(ir);
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('isDeleted', () => {
  it('returns false for a node that has not been deleted', () => {
    expect(useWorkingCopyStore.getState().isDeleted('n1')).toBe(false);
  });

  it('returns true after deleteNode and false after restoreNode', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    expect(useWorkingCopyStore.getState().isDeleted('n1')).toBe(true);
    useWorkingCopyStore.getState().restoreNode('n1');
    expect(useWorkingCopyStore.getState().isDeleted('n1')).toBe(false);
  });
});

describe('deleteItem / restoreItem / isItemDeleted', () => {
  it('deleteItem marks the item deleted and pushes { k: "i", id } onto undoStack', () => {
    useWorkingCopyStore.getState().deleteItem('n1#0');
    const s = useWorkingCopyStore.getState();
    expect(s.isItemDeleted('n1#0')).toBe(true);
    expect(s.undoStack).toEqual([{ k: 'i', id: 'n1#0' }]);
  });

  it('restoreItem removes the item from deletedItemIds and filters its undoStack entries', () => {
    useWorkingCopyStore.getState().deleteItem('n1#0');
    useWorkingCopyStore.getState().deleteItem('n1#1');
    useWorkingCopyStore.getState().restoreItem('n1#0');
    const s = useWorkingCopyStore.getState();
    expect(s.isItemDeleted('n1#0')).toBe(false);
    expect(s.isItemDeleted('n1#1')).toBe(true);
    expect(s.undoStack).toEqual([{ k: 'i', id: 'n1#1' }]);
  });

  it('restoreItem removes all occurrences of itemId from undoStack', () => {
    useWorkingCopyStore.getState().deleteItem('n1#0');
    useWorkingCopyStore.getState().deleteItem('n1#0');
    useWorkingCopyStore.getState().restoreItem('n1#0');
    const s = useWorkingCopyStore.getState();
    expect(s.isItemDeleted('n1#0')).toBe(false);
    expect(s.undoStack).toHaveLength(0);
  });

  it('isItemDeleted returns false before deleteItem, true after, and false after restoreItem', () => {
    expect(useWorkingCopyStore.getState().isItemDeleted('n1#0')).toBe(false);
    useWorkingCopyStore.getState().deleteItem('n1#0');
    expect(useWorkingCopyStore.getState().isItemDeleted('n1#0')).toBe(true);
    useWorkingCopyStore.getState().restoreItem('n1#0');
    expect(useWorkingCopyStore.getState().isItemDeleted('n1#0')).toBe(false);
  });

  it('undoDelete pops an item entry (k: "i" branch)', () => {
    useWorkingCopyStore.getState().deleteItem('n1#0');
    useWorkingCopyStore.getState().deleteItem('n1#1');
    useWorkingCopyStore.getState().undoDelete();
    const s = useWorkingCopyStore.getState();
    expect(s.isItemDeleted('n1#1')).toBe(false);
    expect(s.isItemDeleted('n1#0')).toBe(true);
    expect(s.undoStack).toEqual([{ k: 'i', id: 'n1#0' }]);
  });

  it('undoDelete handles a mixed node/item stack and pops item entry when it is last', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().deleteItem('n1#0');
    useWorkingCopyStore.getState().undoDelete();
    const s = useWorkingCopyStore.getState();
    expect(s.isItemDeleted('n1#0')).toBe(false);
    expect(s.isDeleted('n1')).toBe(true);
    expect(s.undoStack).toEqual([{ k: 'n', id: 'n1' }]);
  });

  it('restoreAll clears both deletedNodeIds and deletedItemIds and empties undoStack', () => {
    useWorkingCopyStore.getState().deleteNode('n1');
    useWorkingCopyStore.getState().deleteItem('n1#0');
    useWorkingCopyStore.getState().restoreAll();
    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});
