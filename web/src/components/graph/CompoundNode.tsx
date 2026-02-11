import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { formatName } from '../../utils/format';

function formatPosition(pos: string): string {
  return `${pos}-shape`;
}

// Abbreviation map for long names (keep Major/Minor unabbreviated)
const ABBREVIATIONS: Record<string, string> = {
  pentatonic_minor: 'Pent. Minor',
  pentatonic_major: 'Pent. Major',
  harmonic_minor: 'Harm. Minor',
  harmonic_major: 'Harm. Major',
  melodic_minor: 'Mel. Minor',
  diminished_hw: 'Dim. HW',
  diminished_wh: 'Dim. WH',
  phrygian_dominant: 'Phryg. Dom.',
  hungarian_minor: 'Hung. Minor',
  lydian_dominant: 'Lyd. Dom.',
  mixolydian_b6: 'Mixo. b6',
  locrian_sharp2: 'Loc. #2',
  double_harmonic_major: 'Dbl Harm. Major',
  dorian_b2: 'Dor. b2',
  whole_tone: 'Whole Tone',
  quintuplets: 'Quints',
  sextuplets: 'Sexts',
};

function abbreviate(raw: string): string {
  return ABBREVIATIONS[raw] ?? formatName(raw);
}

interface CompoundNodeData {
  id: string;
  label: string;
  scale: string;
  position: string;
  rhythm: string;
  rhythmPattern: string;
  notePattern: string | null;
  bestNpm: number;
  lastNpm: number;
  lastBpm: number;
  attempts: number;
  status: 'unpracticed' | 'practicing' | 'expanded' | 'mastered' | 'struggling';
  hasExpanded: boolean;
  isMastered: boolean;
  strugglingStreak: number;
  lastPracticed: string | null;
  nodeScale?: number;
  isCenter?: boolean;
  isSelected?: boolean;
  isNeighborOfSelected?: boolean;
  isRecommended?: boolean;
  isDimmedBySelection?: boolean;
  isFocused?: boolean;
  focusedScale?: string;
  focusedPosition?: string;
  focusedRhythm?: string;
  focusedNotePattern?: string | null;
  isAboveFocused?: boolean;
}

interface CompoundNodeProps {
  data: CompoundNodeData;
  selected?: boolean;
}

type StatusKey = CompoundNodeData['status'];

const statusStyles: Record<StatusKey, { bg: string; border: string; text: string; borderStyle?: string }> = {
  unpracticed: {
    bg: 'var(--status-unpracticed-bg)',
    border: 'var(--status-unpracticed-border)',
    text: 'var(--text-muted)',
    borderStyle: 'dashed',
  },
  practicing: {
    bg: 'var(--status-practicing-bg)',
    border: 'var(--status-practicing-border)',
    text: 'var(--status-practicing-border)',
  },
  expanded: {
    bg: 'var(--status-expanded-bg)',
    border: 'var(--status-expanded-border)',
    text: 'var(--status-expanded-border)',
  },
  mastered: {
    bg: 'var(--status-mastered-bg)',
    border: 'var(--status-mastered-border)',
    text: 'var(--status-mastered-border)',
  },
  struggling: {
    bg: 'var(--status-struggling-bg)',
    border: 'var(--status-struggling-border)',
    text: 'var(--status-struggling-border)',
  },
};

function CompoundNode({ data, selected }: CompoundNodeProps) {
  const [hovered, setHovered] = useState(false);
  const config = statusStyles[data.status];
  const isSelected = data.isSelected ?? selected ?? false;
  const isFocused = data.isFocused ?? isSelected;
  const isRecommended = data.isRecommended ?? false;
  const isDimmed = data.isDimmedBySelection ?? false;
  const isUnpracticed = data.status === 'unpracticed';
  const isAbove = data.isAboveFocused ?? false;

  // Opacity
  let opacity = 1;
  if (isDimmed && isUnpracticed) {
    opacity = 0.1;
  } else if (isDimmed) {
    opacity = 0.3;
  } else if (isUnpracticed && !isFocused) {
    opacity = 0.7;
  }

  const borderWidth =
    data.status === 'expanded' || data.status === 'mastered' || data.status === 'struggling' ? 2 : 1;

  // Box shadow
  let boxShadow: string | undefined;
  if (isFocused && isUnpracticed) {
    boxShadow = `0 0 14px rgba(255,255,255,0.3)`;
  } else if (isFocused) {
    boxShadow = `0 0 18px ${config.border}`;
  } else if (isRecommended) {
    boxShadow = `0 0 0 2px var(--accent-primary)`;
  }

  // Compute diff labels
  let diffLabel: string | null = null;
  let diffLabelAbbrev: string | null = null;
  if (!isFocused && data.focusedScale !== undefined) {
    const diffs: string[] = [];
    const diffsAbbrev: string[] = [];
    if (data.scale !== data.focusedScale) {
      diffs.push(formatName(data.scale));
      diffsAbbrev.push(abbreviate(data.scale));
    }
    if (data.position !== data.focusedPosition) {
      diffs.push(formatPosition(data.position));
      diffsAbbrev.push(formatPosition(data.position));
    }
    if (data.rhythm !== data.focusedRhythm) {
      diffs.push(formatName(data.rhythm));
      diffsAbbrev.push(abbreviate(data.rhythm));
    }
    if ((data.notePattern ?? null) !== (data.focusedNotePattern ?? null) && data.notePattern) {
      diffs.push(formatName(data.notePattern));
      diffsAbbrev.push(abbreviate(data.notePattern));
    }
    diffLabel = diffs.length > 0 ? diffs.join(' \u00B7 ') : formatName(data.scale);
    diffLabelAbbrev = diffsAbbrev.length > 0 ? diffsAbbrev.join(' \u00B7 ') : abbreviate(data.scale);
  }

  const sharedProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  const animStyle = isRecommended
    ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }
    : {};

  const hasPracticeStats = data.attempts > 0;
  const bpmDisplay = data.lastBpm > 0 ? `${data.lastBpm} BPM` : '-';

  // Hover expand direction: above focused → expand upward, below/adjacent → expand downward
  const hoverTranslateY = isAbove ? '4px' : '-4px';

  // Compute hover width from label length (~6.5px per char at text-[10px] font-semibold + padding)
  const hoverWidth = diffLabel
    ? Math.max(88, Math.ceil(diffLabel.length * 6.5) + 20)
    : 88;

  // --- Compact (non-focused) view: left-border card ---
  if (!isFocused && diffLabel !== null) {
    return (
      <div
        className="shadow-lg relative cursor-pointer"
        style={{
          width: hovered ? `${hoverWidth}px` : '88px',
          height: hovered ? '46px' : '36px',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: config.bg,
          borderWidth: '0',
          borderLeftWidth: '3px',
          borderStyle: 'solid',
          borderColor: config.border,
          borderRadius: '4px',
          opacity,
          paddingLeft: '8px',
          paddingRight: '6px',
          overflow: 'hidden',
          transition:
            'width 150ms ease-out, height 150ms ease-out, transform 150ms ease-out, filter 150ms ease-out, box-shadow 150ms ease-out',
          transform: hovered ? `translateY(${hoverTranslateY})` : undefined,
          filter: hovered ? 'brightness(1.1)' : undefined,
          boxShadow: hovered
            ? `0 4px 16px rgba(0,0,0,0.5), ${boxShadow ?? ''}`
            : boxShadow,
          zIndex: hovered ? 30 : undefined,
          ...animStyle,
        }}
        {...sharedProps}
      >
        <Handle type="target" position={Position.Top} id="t-top" className="!opacity-0" />
        <Handle type="target" position={Position.Bottom} id="t-bottom" className="!opacity-0" />
        <Handle type="target" position={Position.Left} id="t-left" className="!opacity-0" />
        <Handle type="target" position={Position.Right} id="t-right" className="!opacity-0" />
        <Handle type="source" position={Position.Top} id="s-top" className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} id="s-bottom" className="!opacity-0" />
        <Handle type="source" position={Position.Left} id="s-left" className="!opacity-0" />
        <Handle type="source" position={Position.Right} id="s-right" className="!opacity-0" />
        {hovered ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div
              className="text-[10px] font-semibold whitespace-nowrap"
              style={{ color: config.text }}
            >
              {diffLabel}
            </div>
            {hasPracticeStats ? (
              <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                <span className="font-bold" style={{ color: config.text }}>
                  {bpmDisplay}
                </span>{' '}
                &middot; {data.attempts}x
              </div>
            ) : (
              <div className="text-[9px] italic" style={{ color: 'var(--text-muted)' }}>
                Unpracticed
              </div>
            )}
          </div>
        ) : (
          <div
            className="text-xs font-medium whitespace-nowrap"
            style={{ color: config.text, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {diffLabelAbbrev}
          </div>
        )}
      </div>
    );
  }

  // --- Focused view: left-border card matching compact style, with glow ---
  // Fixed width sized to fit longest possible scale name ("Double Harmonic Major" at 13px semibold)
  const FOCUSED_WIDTH = 195;
  const focusedBorderW = Math.max(3, borderWidth + 1);
  const focusedBg = isUnpracticed ? 'var(--bg-elevated)' : config.bg;
  const focusedBorder = isUnpracticed ? 'var(--status-unpracticed-border)' : config.border;
  const focusedText = isUnpracticed ? 'var(--text-muted)' : config.text;

  return (
    <div
      className={`shadow-lg relative cursor-pointer transition-all duration-150 ${data.status === 'mastered' ? 'mastered-shimmer' : ''}`}
      style={{
        width: `${FOCUSED_WIDTH}px`,
        backgroundColor: focusedBg,
        borderWidth: '0',
        borderLeftWidth: `${focusedBorderW}px`,
        borderStyle: 'solid',
        borderColor: focusedBorder,
        borderRadius: '6px',
        paddingLeft: '10px',
        paddingRight: '10px',
        paddingTop: '6px',
        paddingBottom: '6px',
        opacity,
        boxShadow,
        ...animStyle,
      }}
      {...sharedProps}
    >
      <Handle type="target" position={Position.Top} id="t-top" className="!opacity-0" />
      <Handle type="target" position={Position.Bottom} id="t-bottom" className="!opacity-0" />
      <Handle type="target" position={Position.Left} id="t-left" className="!opacity-0" />
      <Handle type="target" position={Position.Right} id="t-right" className="!opacity-0" />
      <Handle type="source" position={Position.Top} id="s-top" className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} id="s-bottom" className="!opacity-0" />
      <Handle type="source" position={Position.Left} id="s-left" className="!opacity-0" />
      <Handle type="source" position={Position.Right} id="s-right" className="!opacity-0" />

      <div className="font-semibold text-[13px] whitespace-nowrap" style={{ color: focusedText }}>
        {formatName(data.scale)}
      </div>
      <div className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
        {formatPosition(data.position)} / {formatName(data.rhythm)}
      </div>
      {data.notePattern && (
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {formatName(data.notePattern)}
        </div>
      )}

      {data.attempts > 0 && (
        <div
          className="mt-1 pt-1 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {data.attempts}x
          </span>
          <span className="font-bold text-[10px]" style={{ color: focusedText }}>
            {data.lastBpm > 0 ? `${data.lastBpm} BPM` : '-'}
          </span>
        </div>
      )}

    </div>
  );
}

export default memo(CompoundNode);
