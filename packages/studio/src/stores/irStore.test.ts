import { describe, it, expect, beforeEach } from 'vitest';
import { useIRStore } from './irStore.ts';
import { makeTestIR } from '@keyboard-studio/contracts/fixtures';

const reset = () =>
  useIRStore.setState({ ir: null, deletedNodeIds: new Set(), undoStack: [] });

beforeEach(reset);

const ir = makeTestIR([]);

describe('setIR', () => {
  it('populates ir and clears deletion state', () => {
    useIRStore.getState().deleteNode('old');
    useIRStore.getState().setIR(ir);
    const s = useIRStore.getState();
    expect(s.ir).toBe(ir);
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('clearIR', () => {
  it('resets ir to null and clears deletion state', () => {
    useIRStore.getState().setIR(ir);
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().clearIR();
    const s = useIRStore.getState();
    expect(s.ir).toBeNull();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('deleteNode', () => {
  it('marks a node as deleted and records it in undoStack', () => {
    useIRStore.getState().deleteNode('n1');
    const s = useIRStore.getState();
    expect(s.isDeleted('n1')).toBe(true);
    expect(s.undoStack).toEqual(['n1']);
  });

  it('deleting the same node twice pushes two undoStack entries but deduplicates deletedNodeIds', () => {
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().deleteNode('n1');
    expect(useIRStore.getState().undoStack).toHaveLength(2);
    expect(useIRStore.getState().deletedNodeIds.size).toBe(1);
  });
});

describe('undoDelete', () => {
  it('is a no-op when undoStack is empty', () => {
    useIRStore.getState().undoDelete();
    expect(useIRStore.getState().undoStack).toHaveLength(0);
  });

  it('restores the most recently deleted node', () => {
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().deleteNode('n2');
    useIRStore.getState().undoDelete();
    const s = useIRStore.getState();
    expect(s.isDeleted('n2')).toBe(false);
    expect(s.isDeleted('n1')).toBe(true);
    expect(s.undoStack).toEqual(['n1']);
  });
});

describe('restoreNode', () => {
  it('removes a specific node from deletedNodeIds and undoStack', () => {
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().deleteNode('n2');
    useIRStore.getState().restoreNode('n1');
    const s = useIRStore.getState();
    expect(s.isDeleted('n1')).toBe(false);
    expect(s.isDeleted('n2')).toBe(true);
    expect(s.undoStack).toEqual(['n2']);
  });

  it('is a no-op for a nodeId that was never deleted', () => {
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().restoreNode('ghost');
    expect(useIRStore.getState().undoStack).toEqual(['n1']);
  });

  it('removes all occurrences of nodeId from undoStack', () => {
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().restoreNode('n1');
    const s = useIRStore.getState();
    expect(s.isDeleted('n1')).toBe(false);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('keepAll', () => {
  it('clears all deletions and undoStack while preserving ir', () => {
    useIRStore.getState().setIR(ir);
    useIRStore.getState().deleteNode('n1');
    useIRStore.getState().deleteNode('n2');
    useIRStore.getState().keepAll();
    const s = useIRStore.getState();
    expect(s.ir).toBe(ir);
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.undoStack).toHaveLength(0);
  });
});

describe('isDeleted', () => {
  it('returns false for a node that has not been deleted', () => {
    expect(useIRStore.getState().isDeleted('n1')).toBe(false);
  });

  it('returns true after deleteNode and false after restoreNode', () => {
    useIRStore.getState().deleteNode('n1');
    expect(useIRStore.getState().isDeleted('n1')).toBe(true);
    useIRStore.getState().restoreNode('n1');
    expect(useIRStore.getState().isDeleted('n1')).toBe(false);
  });
});
