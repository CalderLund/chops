import { create } from 'zustand';
import type { GraphNode, Suggestion } from '../api/client';

interface SessionStore {
  // Graph state
  selectedNode: GraphNode | null;
  recommendedNodeId: string | null;

  // Practice state
  currentSuggestion: Suggestion | null;
  candidateScores: Map<string, number>;

  // Actions
  setSelectedNode: (node: GraphNode | null) => void;
  setRecommendedNodeId: (id: string | null) => void;
  setCurrentSuggestion: (suggestion: Suggestion | null) => void;
  setCandidateScores: (scores: Map<string, number>) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  selectedNode: null,
  recommendedNodeId: null,
  currentSuggestion: null,
  candidateScores: new Map(),

  setSelectedNode: (node) => set({ selectedNode: node }),
  setRecommendedNodeId: (id) => set({ recommendedNodeId: id }),
  setCurrentSuggestion: (suggestion) => set({ currentSuggestion: suggestion }),
  setCandidateScores: (scores) => set({ candidateScores: scores }),
}));

// Keep backward-compatible export for any remaining imports
export const usePracticeStore = useSessionStore;
