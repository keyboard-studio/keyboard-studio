import { create } from 'zustand';
import type { KeyboardIR } from '@keyboard-studio/contracts';

interface IRStoreState {
  ir: KeyboardIR | null;
  deletedNodeIds: Set<string>;
  undoStack: string[];
  setIR: (ir: KeyboardIR) => void;
  deleteNode: (nodeId: string) => void;
  undoDelete: () => void;
  isDeleted: (nodeId: string) => boolean;
  keepAll: () => void;
}

export const useIRStore = create<IRStoreState>((set, get) => ({
  ir: null,
  deletedNodeIds: new Set(),
  undoStack: [],
  setIR: (ir) => set({ ir, deletedNodeIds: new Set(), undoStack: [] }),
  deleteNode: (nodeId) => set((s) => ({
    deletedNodeIds: new Set([...s.deletedNodeIds, nodeId]),
    undoStack: [...s.undoStack, nodeId],
  })),
  undoDelete: () => set((s) => {
    if (s.undoStack.length === 0) return s;
    const last = s.undoStack[s.undoStack.length - 1] as string;
    const next = new Set(s.deletedNodeIds);
    next.delete(last);
    return { deletedNodeIds: next, undoStack: s.undoStack.slice(0, -1) };
  }),
  isDeleted: (nodeId) => get().deletedNodeIds.has(nodeId),
  keepAll: () => set({ deletedNodeIds: new Set(), undoStack: [] }),
}));
