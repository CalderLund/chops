import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStreakInfo, type GraphNode, type Suggestion, type PracticeOptions } from '../api/client';
import theme from '../themes';
import Metronome from './Metronome';
import { formatName } from '../utils/format';

function npmToBpm(npm: number): number {
  return Math.round(npm / 2);
}

function statusLabel(status: GraphNode['data']['status']): string {
  switch (status) {
    case 'mastered':
      return 'Mastered';
    case 'expanded':
      return 'Expanded';
    case 'practicing':
      return 'Practicing';
    case 'struggling':
      return 'Needs Attention';
    case 'unpracticed':
      return 'Unpracticed';
  }
}

type StatusKey = GraphNode['data']['status'];

function statusBadgeStyle(status: StatusKey): React.CSSProperties {
  const bgVar = `var(--status-${status === 'unpracticed' ? 'unpracticed' : status}-bg)`;
  const borderVar = `var(--status-${status === 'unpracticed' ? 'unpracticed' : status}-border)`;
  const textVar = status === 'unpracticed' ? 'var(--text-muted)' : borderVar;
  return {
    backgroundColor: bgVar,
    color: textVar,
    borderColor: borderVar,
  };
}

const DEFAULT_CELEBRATION_MESSAGES = [
  'Clean runs!',
  'Frets are singing!',
  'Locked in!',
  'Tight timing!',
  "That's woodshedding!",
  'Building calluses!',
  'Tone is there!',
  'Smooth legato!',
];

interface CelebrationData {
  bpm: number;
  message: string;
}

interface PracticePanelProps {
  selectedNode: GraphNode | null;
  isRecommended: boolean;
  reasoning: string | null;
  suggestion: Suggestion | null;
  options: PracticeOptions | null;
  onLogPractice: (data: {
    bpm: number;
    scale: string;
    position: string;
    rhythm: string;
    notePattern: string;
    key: string;
  }) => void;
  onTryAnother: () => void;
  isLogging: boolean;
  isGenerating: boolean;
  logError: string | null;
}

export default function PracticePanel({
  selectedNode,
  isRecommended,
  reasoning,
  suggestion,
  options,
  onLogPractice,
  onTryAnother,
  isLogging,
  isGenerating,
  logError,
}: PracticePanelProps) {
  const [metronomeBpm, setMetronomeBpm] = useState(80);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [selectedKey, setSelectedKey] = useState(suggestion?.key ?? 'C');
  const celebrationMessages = theme.celebrationMessages ?? DEFAULT_CELEBRATION_MESSAGES;

  // Sync key when suggestion changes
  useEffect(() => {
    if (suggestion) {
      setSelectedKey(suggestion.key);
    }
  }, [suggestion]);

  // Auto-advance after celebration
  useEffect(() => {
    if (celebration) {
      const timer = setTimeout(() => {
        setCelebration(null);
        onTryAnother();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [celebration, onTryAnother]);

  const { data: streak } = useQuery({
    queryKey: ['streak'],
    queryFn: getStreakInfo,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a node from the graph to practice</p>
      </div>
    );
  }

  const { data } = selectedNode;
  const exerciseName = `${formatName(data.scale)} Scale`;
  const exerciseDetail = `${data.position}-Shape / ${formatName(data.rhythm)}`;
  const notePattern = data.notePattern ? formatName(data.notePattern) : null;

  const handleLog = () => {
    if (metronomeBpm <= 0) return;
    onLogPractice({
      bpm: metronomeBpm,
      scale: data.scale,
      position: data.position,
      rhythm: data.rhythm,
      notePattern: data.notePattern || 'stepwise',
      key: selectedKey,
    });
    setCelebration({
      bpm: metronomeBpm,
      message: celebrationMessages[Math.floor(Math.random() * celebrationMessages.length)],
    });
  };

  // Celebration state (inline)
  if (celebration) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-8">
        <div
          className="text-3xl font-black mb-3"
          style={{ color: 'var(--accent-primary)' }}
        >
          {celebration.message}
        </div>
        <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{exerciseName} / {exerciseDetail}</div>
        <div className="text-2xl font-bold mb-4" style={{ color: 'var(--status-expanded-border)' }}>
          {celebration.bpm} <span className="text-base" style={{ color: 'var(--text-muted)' }}>BPM</span>
        </div>
        {streak && streak.currentStreak > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full mb-4"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
            }}
          >
            <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>*</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>
              {streak.currentStreak} day streak
            </span>
          </div>
        )}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading next exercise...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Error banner */}
      {logError && (
        <div
          className="mx-4 mt-3 rounded-lg p-3"
          style={{
            backgroundColor: 'var(--status-struggling-bg)',
            border: '1px solid var(--status-struggling-border)',
          }}
        >
          <p className="text-xs" style={{ color: 'var(--status-struggling-border)' }}>{logError}</p>
        </div>
      )}

      {/* Exercise display */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{exerciseName}</h2>
          <span
            className="text-xs px-2 py-0.5 rounded-full shrink-0"
            style={{ ...statusBadgeStyle(data.status), borderWidth: '1px', borderStyle: 'solid' }}
          >
            {statusLabel(data.status)}
          </span>
        </div>
        <p className="text-base mb-1" style={{ color: 'var(--text-secondary)' }}>{exerciseDetail}</p>
        {notePattern && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{notePattern}</p>
        )}
      </div>

      {/* Stats row */}
      {data.attempts > 0 && (
        <div className="flex items-center gap-5 px-5 pb-3 text-xs">
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Attempts</span>
            <span className="ml-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>{data.attempts}</span>
          </div>
          {data.lastBpm > 0 && (
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Last</span>
              <span className="ml-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>{data.lastBpm} BPM</span>
            </div>
          )}
          {data.bestNpm > 0 && (
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Best</span>
              <span className="ml-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>~{npmToBpm(data.bestNpm)} BPM</span>
            </div>
          )}
        </div>
      )}

      {/* Scale info */}
      {(data.scaleTonality || data.scaleUses) && (
        <div
          className="mx-5 mb-3 px-3 py-2 rounded-lg"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--edge-scale, #9B6DFF) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--edge-scale, #9B6DFF) 15%, transparent)',
          }}
        >
          {data.scaleTonality && (
            <p className="text-xs font-medium mb-0.5" style={{ color: 'color-mix(in srgb, var(--edge-scale, #9B6DFF) 80%, var(--text-primary))' }}>
              {data.scaleTonality}
            </p>
          )}
          {data.scaleUses && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {data.scaleUses}
            </p>
          )}
        </div>
      )}

      {/* Reasoning */}
      {isRecommended && reasoning && (
        <div
          className="mx-5 mb-3 px-3 py-2 rounded-lg"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--status-expanded-border) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--status-expanded-border) 20%, transparent)',
          }}
        >
          <p className="text-xs" style={{ color: 'color-mix(in srgb, var(--status-expanded-border) 80%, var(--text-primary))' }}>{reasoning}</p>
        </div>
      )}

      {/* Key picker */}
      <div className="px-5 mb-4">
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
      <div className="px-5 mb-4">
        <Metronome initialBpm={metronomeBpm} onBpmChange={setMetronomeBpm} />
      </div>

      {/* Log button */}
      <div className="px-5 mb-3">
        <button
          type="button"
          onClick={handleLog}
          disabled={isLogging || metronomeBpm <= 0}
          className="w-full py-3.5 font-semibold text-base rounded-xl transition-colors disabled:cursor-not-allowed"
          style={{
            backgroundColor: isLogging || metronomeBpm <= 0 ? 'var(--bg-elevated)' : 'var(--cta)',
            backgroundImage: isLogging || metronomeBpm <= 0 ? 'none' : 'var(--cta-gradient)',
            color: isLogging || metronomeBpm <= 0 ? 'var(--text-muted)' : 'var(--bg-deep)',
          }}
          onMouseEnter={(e) => {
            if (!isLogging && metronomeBpm > 0) {
              const el = e.target as HTMLElement;
              el.style.backgroundColor = 'var(--cta-hover)';
              el.style.filter = 'brightness(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLogging && metronomeBpm > 0) {
              const el = e.target as HTMLElement;
              el.style.backgroundColor = 'var(--cta)';
              el.style.filter = '';
            }
          }}
        >
          {isLogging ? 'Logging...' : `Done - Log at ${metronomeBpm} BPM`}
        </button>
      </div>

      {/* Try another (only for recommended) */}
      {isRecommended && (
        <div className="text-center pb-5">
          <button
            type="button"
            onClick={onTryAnother}
            disabled={isGenerating}
            className="text-sm transition-colors disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
          >
            {isGenerating ? 'Generating...' : 'Try another'}
          </button>
        </div>
      )}
    </div>
  );
}
