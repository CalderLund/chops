import { create } from 'zustand';
import type { GraphNode } from '../api/client';

interface SessionStore {
  // Graph state
  selectedNode: GraphNode | null;

  // Practice state
  candidateScores: Map<string, number>;

  // Actions
  setSelectedNode: (node: GraphNode | null) => void;
  setCandidateScores: (scores: Map<string, number>) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  selectedNode: null,
  candidateScores: new Map(),

  setSelectedNode: (node) => set({ selectedNode: node }),
  setCandidateScores: (scores) => set({ candidateScores: scores }),
}));

// Keep backward-compatible export for any remaining imports
export const usePracticeStore = useSessionStore;
