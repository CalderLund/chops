import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getGraphLayout,
  getCandidates,
  logPractice,
  getPracticeOptions,
  getCompoundStats,
  type GraphNode,
  type Suggestion,
} from '../api/client';
import { useSessionStore } from '../stores/practiceStore';
import ScaleGallery from '../components/graph/ScaleGallery';
import ScaleNeck from '../components/graph/ScaleNeck';
import PracticePanel from '../components/PracticePanel';
import Metronome from '../components/Metronome';
import { formatName } from '../utils/format';

// --- Onboarding Card (no graph) ---
function OnboardingCard({
  suggestion,
  reasoning,
  options,
  onLogPractice,
  onGenerate,
  isLogging,
  isGenerating,
  logError,
}: {
  suggestion: Suggestion | null;
  reasoning: string | null;
  options: { keys: string[] } | null;
  onLogPractice: (data: {
    bpm: number;
    scale: string;
    position: string;
    rhythm: string;
    notePattern: string;
    key: string;
  }) => void;
  onGenerate: () => void;
  isLogging: boolean;
  isGenerating: boolean;
  logError: string | null;
}) {
  const [metronomeBpm, setMetronomeBpm] = useState(80);
  const [selectedKey, setSelectedKey] = useState(suggestion?.key ?? 'C');

  useEffect(() => {
    if (suggestion) {
      setSelectedKey(suggestion.key);
    }
  }, [suggestion]);

  if (!suggestion) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="rounded-2xl p-8 max-w-md w-full shadow-xl text-center"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
        >
          <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Start Your Journey</h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Practice exercises to build your skill tree. Each exercise you master unlocks new ones nearby.
          </p>
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full font-semibold py-3 rounded-xl transition-colors text-sm disabled:opacity-50"
            style={{
              backgroundColor: isGenerating ? 'var(--bg-elevated)' : 'var(--cta)',
              color: isGenerating ? 'var(--text-muted)' : 'var(--bg-deep)',
            }}
          >
            {isGenerating ? 'Generating...' : 'Get Your First Exercise'}
          </button>
        </div>
      </div>
    );
  }

  const handleLog = () => {
    if (metronomeBpm <= 0) return;
    onLogPractice({
      bpm: metronomeBpm,
      scale: suggestion.scale,
      position: suggestion.position,
      rhythm: suggestion.rhythm,
      notePattern: suggestion.notePattern,
      key: selectedKey,
    });
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col min-h-[60vh] py-4">
      {logError && (
        <div
          className="rounded-lg p-4 mb-4"
          style={{
            backgroundColor: 'var(--status-struggling-bg)',
            border: '1px solid var(--status-struggling-border)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--status-struggling-border)' }}>{logError}</p>
        </div>
      )}

      {/* Exercise display */}
      <div className="text-center pt-4 pb-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {formatName(suggestion.scale)} Scale
        </h1>
        <p className="text-xl sm:text-2xl mb-2" style={{ color: 'var(--text-secondary)' }}>
          {suggestion.position}-Shape <span style={{ color: 'var(--text-muted)' }} className="mx-1">/</span>{' '}
          {formatName(suggestion.rhythm)}
        </p>
        <p className="text-base" style={{ color: 'var(--text-muted)' }}>
          {formatName(suggestion.notePattern)}
          <span className="mx-2">|</span>
          {selectedKey}
        </p>
        {reasoning && (
          <p className="text-sm mt-3 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {reasoning}
          </p>
        )}
      </div>

      {/* Key */}
      <div className="mb-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Key</label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-1"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {(options?.keys ?? ['C', 'D', 'E', 'F', 'G', 'A', 'B']).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metronome */}
      <div className="mb-4">
        <Metronome initialBpm={metronomeBpm} onBpmChange={setMetronomeBpm} />
      </div>

      {/* Log button */}
      <button
        type="button"
        onClick={handleLog}
        disabled={isLogging || metronomeBpm <= 0}
        className="w-full py-4 font-semibold text-lg rounded-xl transition-colors mb-3 disabled:cursor-not-allowed"
        style={{
          backgroundColor: isLogging || metronomeBpm <= 0 ? 'var(--bg-elevated)' : 'var(--cta)',
          color: isLogging || metronomeBpm <= 0 ? 'var(--text-muted)' : 'var(--bg-deep)',
        }}
      >
        {isLogging ? 'Logging...' : `Done - Log at ${metronomeBpm} BPM`}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="text-sm transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-muted)' }}
        >
          {isGenerating ? 'Generating...' : 'Try another'}
        </button>
      </div>
    </div>
  );
}

// --- Main PracticePage ---
export default function PracticePage() {
  const queryClient = useQueryClient();
  const {
    selectedNode,
    setSelectedNode,
    recommendedNodeId,
    setRecommendedNodeId,
    setCandidateScores,
    currentSuggestion,
    setCurrentSuggestion,
  } = useSessionStore();

  const [suggestKey, setSuggestKey] = useState(0);
  const autoSelectedRef = useRef(false);

  // Two-level navigation state
  const [viewLevel, setViewLevel] = useState<'gallery' | 'neck'>('gallery');
  const [selectedScale, setSelectedScale] = useState<string | null>(null);

  // Fetch practice options
  const { data: options } = useQuery({
    queryKey: ['practiceOptions'],
    queryFn: getPracticeOptions,
  });

  // Fetch compound stats for progressive disclosure
  const { data: compoundStatsData } = useQuery({
    queryKey: ['compoundStats'],
    queryFn: getCompoundStats,
    staleTime: 30000,
  });

  const totalPracticed = compoundStatsData?.summary?.total ?? 0;

  // Determine view mode
  const viewMode: 'onboarding' | 'graph' = totalPracticed === 0 ? 'onboarding' : 'graph';

  // Fetch graph layout with suggestion
  const { data: graphData, isLoading: isLoadingGraph } = useQuery({
    queryKey: ['graphLayout', true, true, suggestKey],
    queryFn: () => getGraphLayout(true, true),
    enabled: viewMode === 'graph',
  });

  // Fetch candidate scores
  const { data: candidatesData } = useQuery({
    queryKey: ['candidates'],
    queryFn: getCandidates,
    enabled: viewMode === 'graph',
    staleTime: 30000,
  });

  // Sync recommended node ID from graph data
  useEffect(() => {
    if (graphData?.recommendedNodeId) {
      setRecommendedNodeId(graphData.recommendedNodeId);
    }
  }, [graphData?.recommendedNodeId, setRecommendedNodeId]);

  // Build candidate scores map
  useEffect(() => {
    if (candidatesData) {
      const scoreMap = new Map<string, number>();
      for (const c of candidatesData.candidates) {
        scoreMap.set(c.compoundId, c.probability);
      }
      setCandidateScores(scoreMap);
    }
  }, [candidatesData, setCandidateScores]);

  // Auto-navigate to recommended scale's neck on first load
  useEffect(() => {
    if (graphData?.recommendedNodeId && graphData.nodes && !autoSelectedRef.current && viewLevel === 'gallery') {
      const recNode = graphData.nodes.find((n) => n.id === graphData.recommendedNodeId);
      if (recNode) {
        // Auto-select the recommended node and navigate to its scale's neck
        setSelectedNode(recNode);
        setSelectedScale(recNode.data.scale);
        setViewLevel('neck');
        autoSelectedRef.current = true;
      }
    }
  }, [graphData, setSelectedNode, viewLevel]);

  // Derive suggestion from graph recommendation
  useEffect(() => {
    if (graphData?.recommendedNodeId && graphData.nodes) {
      const node = graphData.nodes.find((n) => n.id === graphData.recommendedNodeId);
      if (node) {
        setCurrentSuggestion({
          rhythm: node.data.rhythm,
          rhythmPattern: node.data.rhythmPattern,
          scale: node.data.scale,
          position: node.data.position,
          notePattern: node.data.notePattern || 'stepwise',
          key: 'C',
          reasoning: graphData.recommendedReasoning ?? '',
          generatedAt: new Date().toISOString(),
        });
      }
    }
  }, [graphData?.recommendedNodeId, suggestKey, setCurrentSuggestion]);

  // Log practice mutation
  const logMutation = useMutation({
    mutationFn: (data: {
      bpm: number;
      scale: string;
      position: string;
      rhythm: string;
      notePattern: string;
      key: string;
    }) => logPractice(data),
    onSuccess: () => {
      autoSelectedRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['graphLayout'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['compoundStats'] });
      queryClient.invalidateQueries({ queryKey: ['currentSuggestion'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      queryClient.invalidateQueries({ queryKey: ['strugglingCompounds'] });
    },
  });

  const handleTryAnother = useCallback(() => {
    autoSelectedRef.current = false;
    setSelectedNode(null);
    setRecommendedNodeId(null);
    setSuggestKey((k) => k + 1);
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
  }, [queryClient, setSelectedNode, setRecommendedNodeId]);

  const handleNodeSelect = useCallback(
    (node: GraphNode | null) => {
      setSelectedNode(node);
    },
    [setSelectedNode],
  );

  const handleLogPractice = useCallback(
    (data: {
      bpm: number;
      scale: string;
      position: string;
      rhythm: string;
      notePattern: string;
      key: string;
    }) => {
      logMutation.mutate(data);
    },
    [logMutation],
  );

  // Gallery → Neck navigation
  const handleSelectScale = useCallback((scaleId: string) => {
    setSelectedScale(scaleId);
    setViewLevel('neck');
  }, []);

  // Neck → Gallery navigation
  const handleBackToGallery = useCallback(() => {
    setViewLevel('gallery');
    setSelectedScale(null);
    setSelectedNode(null);
  }, [setSelectedNode]);

  // --- Onboarding mode ---
  if (viewMode === 'onboarding') {
    return (
      <OnboardingView
        options={options ?? null}
        onLogPractice={handleLogPractice}
        isLogging={logMutation.isPending}
        logError={logMutation.isError ? (logMutation.error as Error).message : null}
        onDone={() => {
          autoSelectedRef.current = false;
          queryClient.invalidateQueries({ queryKey: ['compoundStats'] });
          queryClient.invalidateQueries({ queryKey: ['graphLayout'] });
          queryClient.invalidateQueries({ queryKey: ['candidates'] });
        }}
      />
    );
  }

  // --- Loading state ---
  if (isLoadingGraph) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 80px)' }}>
        <div className="text-center">
          <div className="relative w-12 h-12 mb-4 mx-auto">
            <div
              className="absolute inset-0 rounded-full"
              style={{ border: '4px solid var(--border)' }}
            />
            <div
              className="absolute inset-0 rounded-full animate-spin"
              style={{ border: '4px solid transparent', borderTopColor: 'var(--accent-primary)' }}
            />
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading skill graph...</p>
        </div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 80px)' }}>
        <p style={{ color: 'var(--text-muted)' }}>No graph data available</p>
      </div>
    );
  }

  const isSelectedRecommended = selectedNode?.id === recommendedNodeId;

  // --- Gallery view (full width, no panel) ---
  if (viewLevel === 'gallery') {
    return (
      <div style={{ height: 'calc(100vh - 80px)' }}>
        <ScaleGallery
          nodes={graphData.nodes}
          edges={graphData.edges}
          recommendedNodeId={recommendedNodeId}
          onSelectScale={handleSelectScale}
        />
      </div>
    );
  }

  // --- Neck view (neck + practice panel) ---
  return (
    <div className="flex flex-col md:flex-row" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Neck area */}
      <div
        className="flex-1 relative rounded-xl overflow-hidden m-2"
        style={{
          backgroundColor: 'var(--graph-bg)',
          border: '1px solid var(--border)',
        }}
      >
        <ScaleNeck
          nodes={graphData.nodes}
          edges={graphData.edges}
          selectedScale={selectedScale!}
          selectedNodeId={selectedNode?.id ?? null}
          recommendedNodeId={recommendedNodeId}
          onNodeSelect={handleNodeSelect}
          onBack={handleBackToGallery}
        />
      </div>

      {/* Practice panel */}
      <div
        className="md:shrink-0 md:h-full md:overflow-hidden max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-40 max-md:max-h-[60vh] max-md:rounded-t-2xl backdrop-blur-sm"
        style={{
          width: 'var(--panel-width, 340px)',
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        <PracticePanel
          selectedNode={selectedNode}
          isRecommended={isSelectedRecommended}
          reasoning={graphData.recommendedReasoning ?? null}
          suggestion={currentSuggestion}
          options={options ?? null}
          onLogPractice={handleLogPractice}
          onTryAnother={handleTryAnother}
          isLogging={logMutation.isPending}
          isGenerating={false}
          logError={logMutation.isError ? (logMutation.error as Error).message : null}
        />
      </div>
    </div>
  );
}

// Separate component for onboarding (fetches its own suggestion)
function OnboardingView({
  options,
  onLogPractice,
  isLogging,
  logError,
  onDone,
}: {
  options: { keys: string[] } | null;
  onLogPractice: (data: {
    bpm: number;
    scale: string;
    position: string;
    rhythm: string;
    notePattern: string;
    key: string;
  }) => void;
  isLogging: boolean;
  logError: string | null;
  onDone: () => void;
}) {
  const { setCurrentSuggestion, currentSuggestion } = useSessionStore();

  // Fetch graph layout with suggestion for onboarding too
  const { data: graphData } = useQuery({
    queryKey: ['graphLayout', true, true],
    queryFn: () => getGraphLayout(true, true),
  });

  // Derive suggestion from graph data
  useEffect(() => {
    if (graphData?.recommendedNodeId) {
      const node = graphData.nodes?.find((n) => n.id === graphData.recommendedNodeId);
      if (node) {
        setCurrentSuggestion({
          rhythm: node.data.rhythm,
          rhythmPattern: node.data.rhythmPattern,
          scale: node.data.scale,
          position: node.data.position,
          notePattern: node.data.notePattern || 'stepwise',
          key: 'C',
          reasoning: graphData.recommendedReasoning ?? '',
          generatedAt: new Date().toISOString(),
        });
      } else {
        // Parse compound ID: scale+position+rhythm:pattern[+notePattern]
        const id = graphData.recommendedNodeId;
        const parts = id.split('+');
        if (parts.length >= 3) {
          const scale = parts[0];
          const position = parts[1];
          const rhythmPart = parts[2];
          const [rhythm, rhythmPattern] = rhythmPart.split(':');
          const notePattern = parts[3] || 'stepwise';
          setCurrentSuggestion({
            rhythm,
            rhythmPattern: rhythmPattern || 'xx',
            scale,
            position,
            notePattern,
            key: 'C',
            reasoning: graphData.recommendedReasoning ?? '',
            generatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }, [graphData?.recommendedNodeId, setCurrentSuggestion]);

  const handleLog = useCallback(
    (data: {
      bpm: number;
      scale: string;
      position: string;
      rhythm: string;
      notePattern: string;
      key: string;
    }) => {
      onLogPractice(data);
      onDone();
    },
    [onLogPractice, onDone],
  );

  const handleGenerate = useCallback(() => {
    // Re-fetch graph layout to get a new suggestion
  }, []);

  return (
    <OnboardingCard
      suggestion={currentSuggestion}
      reasoning={graphData?.recommendedReasoning ?? null}
      options={options}
      onLogPractice={handleLog}
      onGenerate={handleGenerate}
      isLogging={isLogging}
      isGenerating={false}
      logError={logError}
    />
  );
}
