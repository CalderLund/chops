import { useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
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
import SkillGraph from '../components/graph/SkillGraph';
import PracticePanel from '../components/PracticePanel';
import Metronome from '../components/Metronome';
import { useState } from 'react';
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

// --- Legend panel ---
function LegendPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute right-4 top-4 backdrop-blur-sm rounded-lg p-3 text-xs z-20 shadow-lg"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Legend</span>
        <button
          onClick={onClose}
          className="transition-colors ml-4 leading-none text-base"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Close legend"
        >
          &times;
        </button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded shrink-0"
            style={{
              backgroundColor: 'var(--status-unpracticed-bg)',
              border: '1px dashed var(--status-unpracticed-border)',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>Unpracticed</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded shrink-0"
            style={{
              backgroundColor: 'var(--status-practicing-bg)',
              border: '1px solid var(--status-practicing-border)',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>Practicing</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded shrink-0"
            style={{
              backgroundColor: 'var(--status-expanded-bg)',
              border: '2px solid var(--status-expanded-border)',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>Expanded</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded shrink-0"
            style={{
              backgroundColor: 'var(--status-mastered-bg)',
              border: '2px solid var(--status-mastered-border)',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>Mastered</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded shrink-0"
            style={{
              backgroundColor: 'var(--status-struggling-bg)',
              border: '2px solid var(--status-struggling-border)',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>Needs Attention</span>
        </div>
      </div>
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Edge Colors</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 shrink-0" style={{ backgroundColor: 'var(--edge-scale)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Scale</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 shrink-0" style={{ backgroundColor: 'var(--edge-position)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Position</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 shrink-0" style={{ backgroundColor: 'var(--edge-rhythm)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Rhythm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 shrink-0" style={{ backgroundColor: 'var(--edge-note-pattern)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Note Pattern</span>
          </div>
        </div>
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
  const [legendOpen, setLegendOpen] = useState(false);
  const [suggestKey, setSuggestKey] = useState(0);
  const autoSelectedRef = useRef(false);

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
  const viewMode: 'onboarding' | 'graph' =
    totalPracticed === 0 ? 'onboarding' : 'graph';

  // Fetch graph layout with suggestion
  // suggestKey forces a fresh fetch when "Try another" is clicked
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

  // Build candidate scores map and log debug info
  useEffect(() => {
    if (candidatesData) {
      const scoreMap = new Map<string, number>();
      for (const c of candidatesData.candidates) {
        scoreMap.set(c.compoundId, c.probability);
      }
      setCandidateScores(scoreMap);

      // Debug logging for candidate scoring
      // Flatten to plain string/number values so console.table renders a proper table
      const tableRows = candidatesData.candidates.map((c) => ({
        compoundId: c.compoundId,
        changedDim: c.changedDimension,
        source: c.sourceCompoundId,
        score: Number(c.score.toFixed(4)),
        probability: (c.probability * 100).toFixed(1) + '%',
        'consol(raw)': Number(c.factors.consolidation.raw.toFixed(3)),
        'consol(w)': Number(c.factors.consolidation.weighted.toFixed(3)),
        'stale(raw)': Number(c.factors.staleness.raw.toFixed(3)),
        'stale(w)': Number(c.factors.staleness.weighted.toFixed(3)),
        'ready(raw)': Number(c.factors.readiness.raw.toFixed(3)),
        'ready(w)': Number(c.factors.readiness.weighted.toFixed(3)),
        'divers(raw)': Number(c.factors.diversity.raw.toFixed(3)),
        'divers(w)': Number(c.factors.diversity.weighted.toFixed(3)),
        recency: Number(c.recencyBoost.toFixed(3)),
        struggling: Number(c.strugglingBoost.toFixed(3)),
        attempts: c.stats?.attempts ?? 0,
        emaNpm: c.stats ? Number(c.stats.emaNpm.toFixed(0)) : 0,
        expanded: c.stats?.hasExpanded ? 'Y' : 'N',
        mastered: c.stats?.isMastered ? 'Y' : 'N',
      }));
      console.groupCollapsed(
        `[Candidates] ${candidatesData.candidates.length} candidates from compound: ${candidatesData.currentCompound}`,
      );
      console.table(tableRows);
      console.groupEnd();
    }
  }, [candidatesData, setCandidateScores]);

  // Auto-select recommended node
  useEffect(() => {
    if (
      graphData?.recommendedNodeId &&
      graphData?.nodes &&
      !autoSelectedRef.current
    ) {
      const recNode = graphData.nodes.find(
        (n) => n.id === graphData.recommendedNodeId,
      );
      if (recNode) {
        setSelectedNode(recNode);
        autoSelectedRef.current = true;
      }
    }
  }, [graphData, setSelectedNode]);

  // Filter graph data: practiced + forward neighbors of selected/recommended
  const filteredData = useMemo(() => {
    if (!graphData) return null;

    // Build bidirectional neighbor map (for edges between practiced nodes)
    const neighborMap = new Map<string, Set<string>>();
    for (const edge of graphData.edges) {
      if (!neighborMap.has(edge.source)) neighborMap.set(edge.source, new Set());
      if (!neighborMap.has(edge.target)) neighborMap.set(edge.target, new Set());
      neighborMap.get(edge.source)!.add(edge.target);
      neighborMap.get(edge.target)!.add(edge.source);
    }

    // Build forward-only neighbor map (source → targets where direction is forward)
    const forwardNeighborMap = new Map<string, Set<string>>();
    for (const edge of graphData.edges) {
      if (edge.data.direction === 'forward') {
        if (!forwardNeighborMap.has(edge.source))
          forwardNeighborMap.set(edge.source, new Set());
        forwardNeighborMap.get(edge.source)!.add(edge.target);
      }
    }

    // Transitive reduction: remove neighbors reachable via other forward neighbors
    const transitiveReduce = (sourceId: string | undefined | null, neighborIds: Set<string>): Set<string> => {
      if (!sourceId || neighborIds.size <= 1) return neighborIds;
      const redundant = new Set<string>();
      for (const nId of neighborIds) {
        // BFS from nId following forward edges to see if it reaches other neighbors
        const visited = new Set<string>();
        const queue = [nId];
        while (queue.length > 0) {
          const current = queue.shift()!;
          const fwd = forwardNeighborMap.get(current);
          if (!fwd) continue;
          for (const next of fwd) {
            if (visited.has(next)) continue;
            visited.add(next);
            if (neighborIds.has(next) && next !== nId) {
              redundant.add(next); // next is reachable from nId, so it's redundant
            }
            queue.push(next);
          }
        }
      }
      const result = new Set<string>();
      for (const id of neighborIds) {
        if (!redundant.has(id)) result.add(id);
      }
      return result;
    };

    const practicedIds = new Set(graphData.nodes.filter((n) => n.data.attempts > 0).map((n) => n.id));

    // Forward neighbors only for expansion of selected/recommended
    const selectedForwardIds = selectedNode
      ? transitiveReduce(selectedNode.id, forwardNeighborMap.get(selectedNode.id) || new Set())
      : new Set<string>();
    const recommendedForwardIds = graphData.recommendedNodeId
      ? transitiveReduce(graphData.recommendedNodeId, forwardNeighborMap.get(graphData.recommendedNodeId) || new Set())
      : new Set<string>();

    const visibleIds = new Set<string>();
    practicedIds.forEach((id) => visibleIds.add(id));
    selectedForwardIds.forEach((id) => visibleIds.add(id));
    recommendedForwardIds.forEach((id) => visibleIds.add(id));
    if (selectedNode) visibleIds.add(selectedNode.id);
    if (graphData.recommendedNodeId) visibleIds.add(graphData.recommendedNodeId);

    const filteredNodes = graphData.nodes.filter((n) => visibleIds.has(n.id));
    const filteredEdges = graphData.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      centerNodeId: graphData.recommendedNodeId ?? graphData.centerNodeId,
    };
  }, [graphData, selectedNode]);

  // Derive suggestion from graph recommendation and set it in the store.
  // Depends on recommendedNodeId (not the full graphData object) to avoid infinite
  // re-render loops. Also depends on suggestKey so "Try another" always updates,
  // even if the backend returns the same recommendedNodeId.
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
    setSuggestKey((k) => k + 1); // Force fresh graph query with new suggestion
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

  // --- Onboarding mode ---
  if (viewMode === 'onboarding') {
    // For brand new users, we generate suggestion from API directly
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

  const hasGraphData = filteredData && filteredData.nodes.length > 0;
  const isSelectedRecommended = selectedNode?.id === recommendedNodeId;

  // --- Graph + Practice view ---
  return (
    <div className="flex flex-col md:flex-row" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Graph area */}
      <div
        className="flex-1 relative rounded-xl overflow-hidden m-2"
        style={{
          backgroundColor: 'var(--graph-bg)',
          border: '1px solid var(--border)',
        }}
      >
        {hasGraphData ? (
          <>
            <ReactFlowProvider>
              <SkillGraph
                initialNodes={filteredData.nodes}
                initialEdges={filteredData.edges}
                centerNodeId={filteredData.centerNodeId}
                recommendedNodeId={recommendedNodeId}
                selectedNodeId={selectedNode?.id ?? null}
                onNodeSelect={handleNodeSelect}
              />
            </ReactFlowProvider>

            {/* Legend toggle */}
            <button
              onClick={() => setLegendOpen(!legendOpen)}
              className="absolute left-4 bottom-4 text-xs px-2.5 py-1 rounded-md transition-colors z-20"
              style={{
                backgroundColor: legendOpen ? 'var(--bg-elevated)' : 'color-mix(in srgb, var(--bg-surface) 90%, transparent)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--border)',
                color: legendOpen ? 'var(--text-secondary)' : 'var(--text-muted)',
              }}
            >
              Legend
            </button>

            {legendOpen && <LegendPanel onClose={() => setLegendOpen(false)} />}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p style={{ color: 'var(--text-muted)' }}>No graph data available</p>
          </div>
        )}
      </div>

      {/* Practice panel - desktop: side panel, mobile: bottom sheet */}
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
          reasoning={graphData?.recommendedReasoning ?? null}
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

  // Derive suggestion from graph data and set it in the store.
  // Only re-run when recommendedNodeId changes to avoid infinite loops
  // (creating a new object with generatedAt would cause re-render cycles).
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
        // Node not in graph (e.g. compound_stats empty but suggestion generated).
        // Parse compound ID: scale+position+rhythm:pattern[+notePattern]
        const id = graphData.recommendedNodeId;
        const parts = id.split('+');
        if (parts.length >= 3) {
          const scale = parts[0];
          const position = parts[1];
          const rhythmPart = parts[2]; // "rhythm:pattern"
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
