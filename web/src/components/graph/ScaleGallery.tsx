import { useMemo, useState } from 'react';
import type { GraphNode, GraphEdge } from '../../api/client';
import { formatName } from '../../utils/format';

// Scale tier structure (from config/scale.yaml)
const SCALE_TIERS = [
  { tier: 1, scales: ['pentatonic_minor', 'blues_minor', 'pentatonic_major'] },
  { tier: 2, scales: ['minor', 'major', 'blues_major'] },
  { tier: 3, scales: ['mixolydian', 'dorian', 'phrygian', 'lydian', 'harmonic_minor'] },
  {
    tier: 4,
    scales: ['melodic_minor', 'phrygian_dominant', 'hungarian_minor', 'double_harmonic_major', 'harmonic_major'],
  },
  {
    tier: 5,
    scales: [
      'lydian_dominant', 'mixolydian_b6', 'locrian_sharp2', 'dorian_b2',
      'altered', 'diminished_hw', 'diminished_wh', 'whole_tone',
    ],
  },
];

// Tier label descriptions
const TIER_LABELS: Record<number, string> = {
  1: 'Foundations',
  2: 'Core Diatonic',
  3: 'Modes & Variants',
  4: 'Advanced Colors',
  5: 'Situational & Effects',
};

type StatusKey = GraphNode['data']['status'];

function getStatusColor(status: StatusKey, part: 'fill' | 'stroke'): string {
  if (part === 'fill') {
    switch (status) {
      case 'mastered': return 'var(--status-mastered-bg)';
      case 'expanded': return 'var(--status-expanded-bg)';
      case 'practicing': return 'var(--status-practicing-bg)';
      case 'struggling': return 'var(--status-struggling-bg)';
      default: return 'var(--status-unpracticed-bg)';
    }
  }
  switch (status) {
    case 'mastered': return 'var(--status-mastered-border)';
    case 'expanded': return 'var(--status-expanded-border)';
    case 'practicing': return 'var(--status-practicing-border)';
    case 'struggling': return 'var(--status-struggling-border)';
    default: return 'var(--status-unpracticed-border)';
  }
}

const STATUS_PRIORITY: Record<StatusKey, number> = {
  mastered: 4,
  expanded: 3,
  practicing: 2,
  struggling: 1,
  unpracticed: 0,
};

function pickBestStatus(statuses: StatusKey[]): StatusKey {
  return statuses.reduce(
    (best, s) => (STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best),
    'unpracticed' as StatusKey,
  );
}

// Guitar silhouette SVG
function GuitarSilhouette({ status }: { status: StatusKey }) {
  const fill = getStatusColor(status, 'fill');
  const stroke = getStatusColor(status, 'stroke');

  return (
    <svg width="48" height="72" viewBox="0 0 48 72" className="block mx-auto">
      <g>
        {/* Headstock */}
        <rect x="18" y="0" width="12" height="6" rx="2" fill={stroke} opacity={0.6} />

        {/* Tuning pegs */}
        <circle cx="16" cy="2" r="2" fill={stroke} opacity={0.4} />
        <circle cx="16" cy="5" r="2" fill={stroke} opacity={0.4} />
        <circle cx="32" cy="2" r="2" fill={stroke} opacity={0.4} />
        <circle cx="32" cy="5" r="2" fill={stroke} opacity={0.4} />

        {/* Neck */}
        <rect x="20" y="6" width="8" height="22" rx="1" fill={stroke} opacity={0.25} />

        {/* Body - upper bout */}
        <ellipse cx="24" cy="38" rx="15" ry="11" fill={fill} stroke={stroke} strokeWidth={1.5} />

        {/* Body - lower bout */}
        <ellipse cx="24" cy="54" rx="19" ry="14" fill={fill} stroke={stroke} strokeWidth={1.5} />

        {/* Sound hole */}
        <circle cx="24" cy="44" r="5" fill="var(--bg-deep)" stroke={stroke} strokeWidth={0.5} opacity={0.4} />

        {/* Bridge */}
        <rect x="19" y="58" width="10" height="2" rx="1" fill={stroke} opacity={0.3} />
      </g>
    </svg>
  );
}

// Scale aggregate data
interface ScaleAggregate {
  practiced: number;
  total: number;
  bestStatus: StatusKey;
  tonality?: string;
  uses?: string;
}

export interface ScaleGalleryProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectScale: (scaleId: string) => void;
}

export default function ScaleGallery({
  nodes,
  edges: _edges,
  onSelectScale,
}: ScaleGalleryProps) {
  const [hoveredScale, setHoveredScale] = useState<string | null>(null);

  // Aggregate node data per scale
  const scaleData = useMemo(() => {
    const m = new Map<string, ScaleAggregate>();
    for (const node of nodes) {
      const scale = node.data.scale;
      if (!m.has(scale)) {
        m.set(scale, {
          practiced: 0,
          total: 0,
          bestStatus: 'unpracticed',
          tonality: node.data.scaleTonality,
          uses: node.data.scaleUses,
        });
      }
      const entry = m.get(scale)!;
      entry.total++;
      if (!entry.tonality && node.data.scaleTonality) entry.tonality = node.data.scaleTonality;
      if (!entry.uses && node.data.scaleUses) entry.uses = node.data.scaleUses;
      if (node.data.attempts > 0) {
        entry.practiced++;
        entry.bestStatus = pickBestStatus([entry.bestStatus, node.data.status]);
      }
    }
    return m;
  }, [nodes]);

  return (
    <div
      className="w-full h-full overflow-auto"
      style={{ backgroundColor: 'var(--graph-bg)' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Scale Gallery
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Choose a scale to explore its exercises
          </p>
        </div>

        {/* Tier rows */}
        {SCALE_TIERS.map(({ tier, scales }) => (
          <div key={tier} className="mb-8">
            {/* Tier header */}
            <div className="flex items-baseline gap-2 mb-3">
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: 'var(--accent-primary)' }}
              >
                Tier {tier}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {TIER_LABELS[tier]}
              </span>
            </div>

            {/* Scale cards */}
            <div className="flex flex-wrap gap-3 justify-center">
              {scales.map((scaleId) => {
                const agg = scaleData.get(scaleId);
                const status = agg?.bestStatus ?? 'unpracticed';
                const practiced = agg?.practiced ?? 0;
                const isHovered = hoveredScale === scaleId;
                const hasPractice = practiced > 0;

                return (
                  <button
                    key={scaleId}
                    onClick={() => onSelectScale(scaleId)}
                    onMouseEnter={() => setHoveredScale(scaleId)}
                    onMouseLeave={() => setHoveredScale(null)}
                    className="relative flex flex-col items-center rounded-xl transition-all"
                    style={{
                      width: 120,
                      padding: '12px 8px 10px',
                      backgroundColor: isHovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      border: `2px solid ${hasPractice ? getStatusColor(status, 'stroke') : 'var(--border)'}`,
                      opacity: hasPractice ? 1 : 0.65,
                      transform: isHovered ? 'translateY(-2px)' : 'none',
                      boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
                    }}
                  >
                    {/* Guitar silhouette */}
                    <GuitarSilhouette status={status} />

                    {/* Scale name */}
                    <span
                      className="text-xs font-medium mt-2 text-center leading-tight"
                      style={{ color: hasPractice ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {formatName(scaleId)}
                    </span>

                    {/* Progress */}
                    {practiced > 0 && (
                      <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        {practiced} practiced
                      </span>
                    )}

                    {/* Hover tooltip */}
                    {isHovered && agg?.tonality && (
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap z-20"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        }}
                      >
                        {agg.tonality}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div
          className="flex items-center justify-center gap-5 mt-4 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: 'var(--status-practicing-bg)',
                border: '1.5px solid var(--status-practicing-border)',
              }}
            />
            Practicing
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: 'var(--status-expanded-bg)',
                border: '1.5px solid var(--status-expanded-border)',
              }}
            />
            Expanded
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: 'var(--status-mastered-bg)',
                border: '1.5px solid var(--status-mastered-border)',
              }}
            />
            Mastered
          </span>
        </div>
      </div>
    </div>
  );
}
