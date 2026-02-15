import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getGraphLayout,
  getCandidates,
  logPractice,
  getPracticeOptions,
  getCompoundStats,
  type GraphNode,
} from '../api/client';
import { useSessionStore } from '../stores/practiceStore';
import ScaleGallery from '../components/graph/ScaleGallery';
import ScaleNeck from '../components/graph/ScaleNeck';
import PracticePanel from '../components/PracticePanel';
import Metronome from '../components/Metronome';
import { formatName } from '../utils/format';

// --- Onboarding Card (no graph) ---
function OnboardingCard({
  options,
  onLogPractice,
  isLogging,
  logError,
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
}) {
  const [metronomeBpm, setMetronomeBpm] = useState(80);
  const [selectedKey, setSelectedKey] = useState('C');

  // Default first exercise for onboarding
  const exercise = {
    scale: 'pentatonic_minor',
    position: 'E',
    rhythm: '8ths',
    notePattern: 'stepwise',
  };

  const handleLog = () => {
    if (metronomeBpm <= 0) return;
    onLogPractice({
      bpm: metronomeBpm,
      scale: exercise.scale,
      position: exercise.position,
      rhythm: exercise.rhythm,
      notePattern: exercise.notePattern,
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

      <div className="text-center pt-4 pb-6">
        <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Start Your Journey</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Practice exercises to build your skill tree. Each exercise you master unlocks new ones nearby.
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {formatName(exercise.scale)} Scale
        </h1>
        <p className="text-xl sm:text-2xl mb-2" style={{ color: 'var(--text-secondary)' }}>
          {exercise.position}-Shape <span style={{ color: 'var(--text-muted)' }} className="mx-1">/</span>{' '}
          {formatName(exercise.rhythm)}
        </p>
        <p className="text-base" style={{ color: 'var(--text-muted)' }}>
          {formatName(exercise.notePattern)}
          <span className="mx-2">|</span>
          {selectedKey}
        </p>
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
    </div>
  );
}

// --- Main PracticePage ---
export default function PracticePage() {
  const queryClient = useQueryClient();
  const {
    selectedNode,
    setSelectedNode,
    setCandidateScores,
  } = useSessionStore();

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

  // Fetch graph layout
  const { data: graphData, isLoading: isLoadingGraph } = useQuery({
    queryKey: ['graphLayout', true, true],
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
      queryClient.invalidateQueries({ queryKey: ['graphLayout'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['compoundStats'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      queryClient.invalidateQueries({ queryKey: ['strugglingCompounds'] });
    },
  });

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
      <OnboardingCard
        options={options ?? null}
        onLogPractice={(data) => {
          handleLogPractice(data);
        }}
        isLogging={logMutation.isPending}
        logError={logMutation.isError ? (logMutation.error as Error).message : null}
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

  // --- Gallery view (full width, no panel) ---
  if (viewLevel === 'gallery') {
    return (
      <div style={{ height: 'calc(100vh - 80px)' }}>
        <ScaleGallery
          nodes={graphData.nodes}
          edges={graphData.edges}
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
          selectedNode={selectedNode}
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
          options={options ?? null}
          onLogPractice={handleLogPractice}
          isLogging={logMutation.isPending}
          logError={logMutation.isError ? (logMutation.error as Error).message : null}
        />
      </div>
    </div>
  );
}

