import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCompoundStats,
  getHistory,
  getAchievements,
  getStreakInfo,
  getStrugglingCompounds,
  getPracticeOptions,
  updateHistoryEntry,
  deleteHistoryEntry,
  recalculateStats,
  type CompoundStats,
  type PracticeEntry,
  type Achievement,
  type PracticeOptions,
} from '../api/client';
import { formatName } from '../utils/format';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function exerciseName(compound: {
  scale: string;
  position: string;
  rhythm: string;
  notePattern?: string | null;
}): string {
  const parts = [formatName(compound.scale), `${compound.position}-Shape`, formatName(compound.rhythm)];
  if (compound.notePattern) parts.push(formatName(compound.notePattern));
  return parts.join(' / ');
}

function entryExerciseName(entry: PracticeEntry): string {
  const parts = [formatName(entry.scale), `${entry.position}-Shape`, formatName(entry.rhythm)];
  if (entry.notePattern) parts.push(formatName(entry.notePattern));
  return parts.join(' / ');
}

function compoundStatus(compound: CompoundStats): 'mastered' | 'expanded' | 'needs-attention' | 'practicing' {
  if (compound.isMastered) return 'mastered';
  if (compound.strugglingStreak > 0) return 'needs-attention';
  if (compound.hasExpanded) return 'expanded';
  return 'practicing';
}

// ---------------------------------------------------------------------------
// Skill Tier System
// ---------------------------------------------------------------------------

const NOTES_PER_BEAT: Record<string, number> = {
  '8ths': 2,
  '16ths': 4,
  triplets: 3,
  quintuplets: 5,
  sextuplets: 6,
};

function getNotesPerBeat(rhythm: string): number {
  return NOTES_PER_BEAT[rhythm] ?? 2;
}

interface SkillTier {
  name: string;
  minNpm: number;
  maxNpm: number;
  varPrefix: string;
}

const SKILL_TIERS: SkillTier[] = [
  { name: 'Learning', minNpm: 0, maxNpm: 199, varPrefix: 'struggling' },
  { name: 'Building', minNpm: 200, maxNpm: 399, varPrefix: 'practicing' },
  { name: 'Refining', minNpm: 400, maxNpm: 479, varPrefix: 'expanded' },
  { name: 'Mastered', minNpm: 480, maxNpm: Infinity, varPrefix: 'mastered' },
];

function getSkillTier(npm: number): SkillTier {
  for (let i = SKILL_TIERS.length - 1; i >= 0; i--) {
    if (npm >= SKILL_TIERS[i].minNpm) return SKILL_TIERS[i];
  }
  return SKILL_TIERS[0];
}

// Achievement progress display helpers
const ACHIEVEMENT_DENOMINATORS: Record<string, number> = {
  'first-practice': 1,
  '3-day-streak': 3,
  '7-day-streak': 7,
  '14-day-streak': 14,
  '30-day-streak': 30,
  'first-expansion': 1,
  'first-mastery': 1,
  'master-5-compounds': 5,
  'master-10-compounds': 10,
  'master-all-positions': 5,
  'try-all-positions': 5,
  'try-all-scales': 4,
  'try-3-rhythms': 3,
  'unlock-note-pattern': 1,
  'practice-10-sessions': 10,
  'reach-400-npm': 400,
  'reach-480-npm': 480,
  'reach-560-npm': 560,
};

function achievementProgressLabel(achievement: Achievement): string | null {
  if (achievement.earned || achievement.progress == null) return null;
  const denom = ACHIEVEMENT_DENOMINATORS[achievement.id];
  if (!denom) return null;
  // For NPM achievements, show as NPM value
  if (achievement.id.startsWith('reach-')) {
    const current = Math.round(achievement.progress * denom);
    return `${current}/${denom}`;
  }
  const current = Math.round(achievement.progress * denom);
  return `${current}/${denom}`;
}

function matchesCompound(
  entry: PracticeEntry,
  compound: CompoundStats,
): boolean {
  return (
    entry.scale === compound.scale &&
    entry.position === compound.position &&
    entry.rhythm === compound.rhythm &&
    (entry.notePattern || null) === (compound.notePattern || null)
  );
}

// ---------------------------------------------------------------------------
// Status style helpers (CSS variable based)
// ---------------------------------------------------------------------------

type CompoundStatusKey = 'mastered' | 'expanded' | 'practicing' | 'needs-attention';

function statusVarStyle(status: CompoundStatusKey): {
  bg: string;
  text: string;
  border: string;
  barColor: string;
  label: string;
} {
  // Map status to CSS variable names
  const varMap: Record<CompoundStatusKey, { varPrefix: string; label: string }> = {
    mastered: { varPrefix: 'mastered', label: 'Mastered' },
    expanded: { varPrefix: 'expanded', label: 'Expanded' },
    practicing: { varPrefix: 'practicing', label: 'Practicing' },
    'needs-attention': { varPrefix: 'struggling', label: 'Needs Attention' },
  };
  const { varPrefix, label } = varMap[status];
  return {
    bg: `var(--status-${varPrefix}-bg)`,
    text: `var(--status-${varPrefix}-border)`,
    border: `var(--status-${varPrefix}-border)`,
    barColor: `var(--status-${varPrefix}-border)`,
    label,
  };
}

// ---------------------------------------------------------------------------
// SVG Icon Components
// ---------------------------------------------------------------------------

function FireIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 23c-4.97 0-9-3.58-9-8 0-3.07 1.64-5.64 3-7.18.4-.46 1.14-.15 1.11.46-.1 2.2.52 3.76 1.58 4.39.35.21.8.02.92-.38.58-1.93 2.07-4.47 4.52-6.3.38-.28.92-.02.96.46.12 1.5.68 3.8 2.73 5.57.42.36 1.07.15 1.2-.38.18-.75.3-1.63.33-2.6.01-.52.68-.77 1.04-.38C21.02 10.62 23 13.85 23 17c0 3.31-2.69 6-6 6h-5z" />
    </svg>
  );
}

function SnowflakeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /><line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    </svg>
  );
}

function CheckIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DiamondIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
    </svg>
  );
}

function AlertIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function StarIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function CompassIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" />
    </svg>
  );
}

function CalendarIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function LightningIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function LockIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function ChevronIcon({ className, style, direction = 'down' }: { className?: string; style?: React.CSSProperties; direction?: 'up' | 'down' }) {
  return (
    <svg
      className={`${className} transition-transform ${direction === 'up' ? 'rotate-180' : ''}`}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function XIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SaveIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Category Icon helper
// ---------------------------------------------------------------------------

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  switch (category) {
    case 'mastery':
      return <StarIcon className={className} />;
    case 'exploration':
      return <CompassIcon className={className} />;
    case 'consistency':
      return <CalendarIcon className={className} />;
    case 'speed':
      return <LightningIcon className={className} />;
    default:
      return <StarIcon className={className} />;
  }
}

// ---------------------------------------------------------------------------
// Achievement category color mapping (CSS variable based)
// ---------------------------------------------------------------------------

function categoryStyle(category: string): { bg: string; border: string; accent: string } {
  switch (category) {
    case 'mastery':
      return {
        bg: 'var(--status-mastered-bg)',
        border: 'var(--status-mastered-border)',
        accent: 'var(--status-mastered-border)',
      };
    case 'exploration':
      return {
        bg: 'var(--status-expanded-bg)',
        border: 'var(--status-expanded-border)',
        accent: 'var(--status-expanded-border)',
      };
    case 'consistency':
      return {
        bg: 'var(--status-practicing-bg)',
        border: 'var(--status-practicing-border)',
        accent: 'var(--status-practicing-border)',
      };
    case 'speed':
      return {
        bg: 'color-mix(in srgb, var(--edge-scale) 15%, var(--bg-deep))',
        border: 'color-mix(in srgb, var(--edge-scale) 30%, var(--border))',
        accent: 'var(--edge-scale)',
      };
    default:
      return {
        bg: 'var(--status-mastered-bg)',
        border: 'var(--status-mastered-border)',
        accent: 'var(--status-mastered-border)',
      };
  }
}

const LOCKED_STYLE = {
  bg: 'color-mix(in srgb, var(--bg-surface) 30%, transparent)',
  border: 'color-mix(in srgb, var(--border) 50%, transparent)',
  accent: 'var(--text-muted)',
};

// ---------------------------------------------------------------------------
// Section 1: Hero Stats Bar
// ---------------------------------------------------------------------------

function HeroStatsBar({
  streak,
  summary,
}: {
  streak: { currentStreak: number; longestStreak: number; streakFreezes: number } | undefined;
  summary: { total: number; expanded: number; mastered: number; struggling: number } | undefined;
}) {
  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;
  const freezes = streak?.streakFreezes ?? 0;

  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex flex-row items-center gap-4">
        {/* Streak badge */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{
            background: `linear-gradient(to right, color-mix(in srgb, var(--accent-primary) 20%, transparent), color-mix(in srgb, var(--accent-primary) 12%, transparent))`,
            border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
          }}
        >
          <FireIcon className="w-6 h-6 shrink-0" style={{ color: 'var(--accent-primary)' }} />
          <div>
            <div className="text-2xl font-bold leading-none" style={{ color: 'var(--accent-primary)' }}>{currentStreak}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: 'color-mix(in srgb, var(--accent-primary) 70%, transparent)' }}>day streak</div>
          </div>
          <div className="ml-2 text-right">
            <div className="text-sm font-bold leading-none" style={{ color: 'var(--text-secondary)' }}>{longestStreak}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>best</div>
          </div>
          {freezes > 0 && (
            <div
              className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--status-expanded-border) 15%, transparent)',
              }}
              title={`${freezes} streak freeze${freezes > 1 ? 's' : ''} available — protects your streak if you miss a day`}
            >
              <SnowflakeIcon className="w-3 h-3" style={{ color: 'var(--status-expanded-border)' }} />
              <span className="text-[10px] font-semibold" style={{ color: 'var(--status-expanded-border)' }}>{freezes}</span>
            </div>
          )}
        </div>

        {/* Summary metrics: Practiced, Expanded, Needs Attention, Mastered */}
        <div className="flex-1 grid grid-cols-4 gap-3">
          <MetricPill
            label="Practiced"
            value={summary?.total ?? 0}
            color="var(--text-secondary)"
          />
          <MetricPill
            label="Expanded"
            value={summary?.expanded ?? 0}
            color="var(--status-expanded-border)"
            icon={<DiamondIcon className="w-3.5 h-3.5" style={{ color: 'var(--status-expanded-border)' }} />}
          />
          <MetricPill
            label="Needs Attention"
            value={summary?.struggling ?? 0}
            color="var(--status-practicing-border)"
            icon={<AlertIcon className="w-4 h-4" style={{ color: 'var(--status-practicing-border)' }} />}
          />
          <MetricPill
            label="Mastered"
            value={summary?.mastered ?? 0}
            color="var(--status-mastered-border)"
            icon={<CheckIcon className="w-4 h-4" style={{ color: 'var(--status-mastered-border)' }} />}
          />
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="text-left">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-lg font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attention Callout (between hero and achievements)
// ---------------------------------------------------------------------------

function AttentionCallout({
  struggling,
}: {
  struggling: Array<{
    id: string;
    scale: string;
    position: string;
    rhythm: string;
    notePattern: string | null;
    strugglingStreak: number;
  }>;
}) {
  if (struggling.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--status-practicing-border) 10%, var(--bg-deep))',
        border: '1px solid color-mix(in srgb, var(--status-practicing-border) 30%, var(--border))',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertIcon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--status-practicing-border)' }} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--status-practicing-border)' }}>
            {struggling.length} exercise{struggling.length !== 1 ? 's' : ''} need{struggling.length === 1 ? 's' : ''} attention
          </h3>
          <div className="mt-2 space-y-1">
            {struggling.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span style={{ color: 'color-mix(in srgb, var(--status-practicing-border) 80%, var(--text-primary))' }}>
                  {exerciseName(s)}
                </span>
                <span className="text-xs" style={{ color: 'color-mix(in srgb, var(--status-practicing-border) 60%, transparent)' }}>
                  {s.strugglingStreak} session{s.strugglingStreak > 1 ? 's' : ''} below threshold
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Achievements
// ---------------------------------------------------------------------------

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const earned = achievement.earned;
  const style = earned ? categoryStyle(achievement.category) : LOCKED_STYLE;
  const progressLabel = achievementProgressLabel(achievement);
  const progressPct = achievement.progress != null ? Math.round(achievement.progress * 100) : 0;

  return (
    <div
      className="rounded-lg p-2 transition-colors relative"
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5" style={{ color: style.accent }}>
          {earned ? (
            <CategoryIcon category={achievement.category} className="w-4 h-4" />
          ) : (
            <LockIcon className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4
            className="text-xs font-semibold leading-tight"
            style={{ color: earned ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {achievement.name}
          </h4>
          <p
            className="text-xs mt-0.5 leading-snug"
            style={{ color: earned ? 'var(--text-secondary)' : 'var(--text-muted)' }}
          >
            {achievement.description}
          </p>
          {earned && achievement.earnedAt && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {formatRelativeDate(achievement.earnedAt)}
            </p>
          )}
          {!earned && progressLabel && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {progressLabel}
                </span>
              </div>
              <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: 'var(--text-muted)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AchievementsSection({
  achievements,
  summary,
}: {
  achievements: Achievement[];
  summary: { total: number; earned: number };
}) {
  const [expanded, setExpanded] = useState(false);

  const earned = achievements.filter((a) => a.earned);
  const unearned = achievements.filter((a) => !a.earned);

  // Most recent: earned achievement with latest earnedAt
  const mostRecent = earned.length > 0
    ? [...earned].sort((a, b) => {
        const ta = a.earnedAt ? new Date(a.earnedAt).getTime() : 0;
        const tb = b.earnedAt ? new Date(b.earnedAt).getTime() : 0;
        return tb - ta;
      })[0]
    : null;

  // Most impressive: last earned in definition order (later = harder)
  const mostImpressive = earned.length > 0
    ? (() => {
        const earnedIds = new Set(earned.map((a) => a.id));
        // achievements are in definition order; pick last earned
        const reversed = [...achievements].reverse();
        return reversed.find((a) => earnedIds.has(a.id) && a.id !== mostRecent?.id) ?? null;
      })()
    : null;

  // Next up: first unearned in definition order
  const nextUp = unearned.length > 0 ? unearned[0] : null;

  // Highlight achievements for collapsed view
  const highlights: { achievement: Achievement; tag: string }[] = [];
  if (mostRecent) highlights.push({ achievement: mostRecent, tag: 'Latest' });
  if (mostImpressive) highlights.push({ achievement: mostImpressive, tag: 'Best' });
  if (nextUp) highlights.push({ achievement: nextUp, tag: 'Next' });

  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left rounded-xl transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Achievements</h3>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {summary.earned}/{summary.total}
          </span>
        </div>
        <ChevronIcon className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} direction={expanded ? 'up' : 'down'} />
      </button>

      {/* Collapsed: compact highlight chips */}
      {!expanded && highlights.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {highlights.map(({ achievement, tag }) => {
            const isEarned = achievement.earned;
            const style = isEarned ? categoryStyle(achievement.category) : LOCKED_STYLE;
            return (
              <div
                key={achievement.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                style={{
                  backgroundColor: style.bg,
                  border: `1px solid ${style.border}`,
                }}
              >
                <span className="shrink-0" style={{ color: style.accent }}>
                  {isEarned ? (
                    <CategoryIcon category={achievement.category} className="w-3 h-3" />
                  ) : (
                    <LockIcon className="w-3 h-3" />
                  )}
                </span>
                <span style={{ color: isEarned ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {achievement.name}
                </span>
                {!isEarned && achievementProgressLabel(achievement) ? (
                  <span
                    className="text-[10px] px-1 py-px rounded tabular-nums font-medium"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--bg-deep) 60%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {achievementProgressLabel(achievement)}
                  </span>
                ) : (
                  <span
                    className="text-[10px] px-1 py-px rounded uppercase tracking-wider font-medium"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--bg-deep) 60%, transparent)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {tag}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded: full list */}
      {expanded && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {earned.map((a) => (
              <AchievementCard key={a.id} achievement={a} />
            ))}
            {unearned.map((a) => (
              <AchievementCard key={a.id} achievement={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Exercise Progress Cards
// ---------------------------------------------------------------------------

function ExerciseRow({
  compound,
  entries,
  options,
}: {
  compound: CompoundStats;
  entries: PracticeEntry[];
  options: PracticeOptions | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = compoundStatus(compound);
  const config = statusVarStyle(status);
  // NPM-based progress: 100 NPM = 0%, 600 NPM = 100%
  const progressPct = compound.lastNpm > 0 ? Math.min(100, Math.max(0, ((compound.lastNpm - 100) / 500) * 100)) : 0;

  const tier = getSkillTier(compound.emaNpm);
  const notesPerBeat = getNotesPerBeat(compound.rhythm);
  const tierIdx = SKILL_TIERS.indexOf(tier);
  const nextTier = tierIdx < SKILL_TIERS.length - 1 ? SKILL_TIERS[tierIdx + 1] : null;

  // Progress within current tier toward next tier
  const tierProgressPct =
    nextTier
      ? Math.min(100, Math.max(0, ((compound.emaNpm - tier.minNpm) / (nextTier.minNpm - tier.minNpm)) * 100))
      : 100;

  // BPM to reach next tier
  const nextTierBpm = nextTier ? Math.ceil(nextTier.minNpm / notesPerBeat) : null;

  // Filter entries matching this compound
  const compoundEntries = entries.filter((e) => matchesCompound(e, compound));

  return (
    <div style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}>
      {/* Collapsed row - clickable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2 text-xs text-left transition-colors"
      >
        {/* Status dot */}
        <div className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: config.border }} />
        {/* Name */}
        <span className="flex-1 truncate text-sm" style={{ color: 'var(--text-primary)' }}>
          {exerciseName(compound)}
        </span>
        {/* BPM */}
        <span className="shrink-0 font-semibold tabular-nums text-sm" style={{ color: 'var(--text-primary)' }}>
          {compound.lastBpm || '--'} <span style={{ color: 'var(--text-muted)' }}>BPM</span>
        </span>
        {/* Mini progress bar */}
        <div className="shrink-0 w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${progressPct}%`, backgroundColor: config.barColor }}
          />
        </div>
        {/* Attempts */}
        <span className="shrink-0 w-8 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {compound.attempts}x
        </span>
        <ChevronIcon
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: 'var(--text-muted)' }}
          direction={expanded ? 'up' : 'down'}
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          {/* Tier indicator + progress */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className="px-1.5 py-0.5 rounded font-semibold"
              style={{
                backgroundColor: `var(--status-${tier.varPrefix}-bg)`,
                color: `var(--status-${tier.varPrefix}-border)`,
                border: `1px solid var(--status-${tier.varPrefix}-border)`,
              }}
            >
              {tier.name}
            </span>
            {nextTier && nextTierBpm !== null && (
              <span style={{ color: 'var(--text-muted)' }}>
                → {nextTier.name} at {nextTierBpm} BPM
              </span>
            )}
          </div>
          {/* Tier progress bar */}
          <div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${tierProgressPct}%`,
                  backgroundColor: `var(--status-${tier.varPrefix}-border)`,
                }}
              />
            </div>
          </div>

          {/* Filtered practice history */}
          {compoundEntries.length > 0 && (
            <div>
              <h4 className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Practice History ({compoundEntries.length})
              </h4>
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--bg-deep) 50%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--border) 30%, transparent)',
                }}
              >
                {compoundEntries.slice(0, 10).map((entry, idx) => (
                  <TimelineEntry
                    key={entry.id}
                    entry={entry}
                    options={options}
                    isLast={idx === Math.min(compoundEntries.length, 10) - 1}
                  />
                ))}
              </div>
              {compoundEntries.length > 10 && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  + {compoundEntries.length - 10} more entries
                </p>
              )}
            </div>
          )}
          {compoundEntries.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No matching practice entries found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseProgressSection({
  compounds,
  entries,
  options,
}: {
  compounds: CompoundStats[];
  entries: PracticeEntry[];
  options: PracticeOptions | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  // Sort: group by base compound (scale+position+rhythm), variants after base.
  // Groups ordered by most recently practiced. Within a group: base first, then variants.
  const sorted = (() => {
    const baseKey = (c: CompoundStats) => `${c.scale}+${c.position}+${c.rhythm}`;
    const groups = new Map<string, CompoundStats[]>();
    for (const c of compounds) {
      const key = baseKey(c);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    // Sort within each group: base (no notePattern or stepwise) first, then by notePattern
    for (const members of groups.values()) {
      members.sort((a, b) => {
        const aIsBase = !a.notePattern || a.notePattern === 'stepwise';
        const bIsBase = !b.notePattern || b.notePattern === 'stepwise';
        if (aIsBase !== bIsBase) return aIsBase ? -1 : 1;
        return (a.notePattern ?? '').localeCompare(b.notePattern ?? '');
      });
    }
    // Sort groups by most recently practiced member
    const groupOrder = [...groups.entries()].sort((a, b) => {
      const aMax = Math.max(...a[1].map((c) => c.lastPracticed ? new Date(c.lastPracticed).getTime() : 0));
      const bMax = Math.max(...b[1].map((c) => c.lastPracticed ? new Date(c.lastPracticed).getTime() : 0));
      return bMax - aMax;
    });
    return groupOrder.flatMap(([, members]) => members);
  })();

  const display = expanded ? sorted : sorted.slice(0, 3);
  const hasMore = sorted.length > 3;

  if (compounds.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Exercise Progress</h3>
        <div
          className="rounded-xl p-6 text-center"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>
            No exercise data yet. Start practicing to track your progress!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Exercise Progress</h3>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{compounds.length} exercises</span>
      </div>
      <div
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)',
          border: '1px solid var(--border)',
        }}
      >
        {display.map((compound) => (
          <ExerciseRow key={compound.id} compound={compound} entries={entries} options={options} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-1 py-1.5 text-xs rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          {expanded ? 'Show fewer' : `Show all ${sorted.length} exercises`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Recent Practice Timeline
// ---------------------------------------------------------------------------

interface TimelineEntryProps {
  entry: PracticeEntry;
  options: PracticeOptions | undefined;
  isLast: boolean;
}

function TimelineEntry({ entry, options }: TimelineEntryProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: {
      bpm: number;
      rhythm: string;
      scale: string;
      position: string;
      notePattern: string;
      key: string;
    }) => updateHistoryEntry(entry.id, data),
    onSuccess: () => {
      setIsEditing(false);
      invalidateAll(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHistoryEntry(entry.id),
    onSuccess: () => {
      setShowDeleteConfirm(false);
      invalidateAll(queryClient);
    },
  });

  // Inline edit form (expanded below the row)
  const formId = `edit-${entry.id}`;
  if (isEditing) {
    return (
      <div
        className="px-3 py-2"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Editing: {entryExerciseName(entry)}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="submit"
              form={formId}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--status-mastered-border)' }}
              title="Save"
              disabled={updateMutation.isPending}
            >
              <SaveIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Cancel"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {options && (
          <TimelineEditForm
            formId={formId}
            entry={entry}
            options={options}
            onSave={(data) => updateMutation.mutate(data)}
            isLoading={updateMutation.isPending}
          />
        )}
        {updateMutation.isError && (
          <p className="mt-1 text-xs" style={{ color: 'var(--status-struggling-border)' }}>
            Error: {(updateMutation.error as Error).message}
          </p>
        )}
      </div>
    );
  }

  // Delete confirmation replaces the row
  if (showDeleteConfirm) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-1.5 text-xs"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}
      >
        <span style={{ color: 'var(--status-struggling-border)' }}>Delete this entry?</span>
        <button
          onClick={() => setShowDeleteConfirm(false)}
          className="px-2 py-0.5 rounded"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          disabled={deleteMutation.isPending}
        >
          Cancel
        </button>
        <button
          onClick={() => deleteMutation.mutate()}
          className="px-2 py-0.5 rounded"
          style={{ backgroundColor: 'var(--status-struggling-border)', color: 'white' }}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? '...' : 'Delete'}
        </button>
        {deleteMutation.isError && (
          <span style={{ color: 'var(--status-struggling-border)' }}>
            {(deleteMutation.error as Error).message}
          </span>
        )}
      </div>
    );
  }

  // Compact single-line row — clicking row enters edit mode, delete on hover
  return (
    <div
      className="group flex items-center gap-3 px-3 py-1.5 transition-colors text-xs cursor-pointer"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}
      onClick={() => setIsEditing(true)}
    >
      <span className="shrink-0 w-28 tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {formatDate(entry.loggedAt)}
      </span>
      <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
        {entryExerciseName(entry)}
      </span>
      <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {entry.bpm} <span style={{ color: 'var(--text-muted)' }}>BPM</span>
      </span>
      {/* Delete icon — hover only */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
        className="shrink-0 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
        style={{ color: 'color-mix(in srgb, var(--status-struggling-border) 60%, transparent)' }}
        title="Delete"
      >
        <TrashIcon className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

function TimelineEditForm({
  formId,
  entry,
  options,
  onSave,
  isLoading,
}: {
  formId: string;
  entry: PracticeEntry;
  options: PracticeOptions;
  onSave: (data: {
    bpm: number;
    rhythm: string;
    scale: string;
    position: string;
    notePattern: string;
    key: string;
  }) => void;
  isLoading: boolean;
}) {
  const [bpm, setBpm] = useState(String(entry.bpm));
  const [scale, setScale] = useState(entry.scale);
  const [position, setPosition] = useState(entry.position);
  const [rhythm, setRhythm] = useState(entry.rhythm);
  const [notePattern, setNotePattern] = useState(entry.notePattern);
  const [key, setKey] = useState(entry.key);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      bpm: parseInt(bpm, 10),
      rhythm,
      scale,
      position,
      notePattern,
      key,
    });
  };

  const selectStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-deep)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="pt-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Scale</label>
          <select value={scale} onChange={(e) => setScale(e.target.value)} className="w-full px-2 py-1 rounded text-sm capitalize" style={selectStyle} disabled={isLoading}>
            {options.scales.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Position</label>
          <select value={position} onChange={(e) => setPosition(e.target.value)} className="w-full px-2 py-1 rounded text-sm capitalize" style={selectStyle} disabled={isLoading}>
            {options.positions.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Rhythm</label>
          <select value={rhythm} onChange={(e) => setRhythm(e.target.value)} className="w-full px-2 py-1 rounded text-sm capitalize" style={selectStyle} disabled={isLoading}>
            {options.rhythms.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Note Pattern</label>
          <select value={notePattern} onChange={(e) => setNotePattern(e.target.value)} className="w-full px-2 py-1 rounded text-sm capitalize" style={selectStyle} disabled={isLoading}>
            {options.notePatterns.map((np) => (<option key={np} value={np}>{np}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Key</label>
          <select value={key} onChange={(e) => setKey(e.target.value)} className="w-full px-2 py-1 rounded text-sm capitalize" style={selectStyle} disabled={isLoading}>
            {options.keys.map((k) => (<option key={k} value={k}>{k}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>BPM</label>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            min="1"
            max="300"
            className="w-full px-2 py-1 rounded text-sm"
            style={selectStyle}
            disabled={isLoading}
          />
        </div>
      </div>
    </form>
  );
}

function RecentPracticeTimeline({
  entries,
  options,
  totalAvailable,
}: {
  entries: PracticeEntry[];
  options: PracticeOptions | undefined;
  totalAvailable: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayEntries = showAll ? entries : entries.slice(0, 20);

  if (entries.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Recent Practice</h3>
        <div
          className="rounded-lg p-6 text-center"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No practice sessions yet. Get started!</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Recent Practice</h3>
      <div
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)',
          border: '1px solid var(--border)',
        }}
      >
        {displayEntries.map((entry, idx) => (
          <TimelineEntry
            key={entry.id}
            entry={entry}
            options={options}
            isLast={idx === displayEntries.length - 1}
          />
        ))}
      </div>
      {!showAll && totalAvailable > 20 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-2 py-2 text-sm rounded-lg transition-colors"
          style={{
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          View all {totalAvailable} sessions
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Query invalidation helper
// ---------------------------------------------------------------------------

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['history'] });
  queryClient.invalidateQueries({ queryKey: ['compoundStats'] });
  queryClient.invalidateQueries({ queryKey: ['streak'] });
  queryClient.invalidateQueries({ queryKey: ['achievements'] });
  queryClient.invalidateQueries({ queryKey: ['strugglingCompounds'] });
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ProgressPage() {
  const queryClient = useQueryClient();

  // Parallel data fetching
  const streakQuery = useQuery({
    queryKey: ['streak'],
    queryFn: getStreakInfo,
    staleTime: 30000,
  });

  const compoundStatsQuery = useQuery({
    queryKey: ['compoundStats'],
    queryFn: getCompoundStats,
  });

  const achievementsQuery = useQuery({
    queryKey: ['achievements'],
    queryFn: getAchievements,
  });

  const historyQuery = useQuery({
    queryKey: ['history'],
    queryFn: () => getHistory(50),
  });

  const strugglingQuery = useQuery({
    queryKey: ['strugglingCompounds'],
    queryFn: getStrugglingCompounds,
  });

  const optionsQuery = useQuery({
    queryKey: ['practiceOptions'],
    queryFn: getPracticeOptions,
  });

  const recalcMutation = useMutation({
    mutationFn: recalculateStats,
    onSuccess: () => invalidateAll(queryClient),
  });

  // Loading state: show skeleton if all primary queries are loading
  const isInitialLoad =
    streakQuery.isLoading &&
    compoundStatsQuery.isLoading &&
    achievementsQuery.isLoading;

  if (isInitialLoad) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Progress</h2>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div
              className="w-8 h-8 rounded-full animate-spin mx-auto mb-3"
              style={{ border: '2px solid var(--accent-primary)', borderTopColor: 'transparent' }}
            />
            <p style={{ color: 'var(--text-secondary)' }}>Loading your progress...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state: show if all primary queries failed
  const hasAnyData =
    streakQuery.data || compoundStatsQuery.data || achievementsQuery.data;
  const allFailed =
    streakQuery.isError && compoundStatsQuery.isError && achievementsQuery.isError;

  if (allFailed && !hasAnyData) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Progress</h2>
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: 'var(--status-struggling-bg)',
            border: '1px solid var(--status-struggling-border)',
          }}
        >
          <p style={{ color: 'var(--status-struggling-border)' }}>
            Error loading progress data. Please try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Page header with recalculate */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Progress</h2>
        <button
          onClick={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
          className="px-3 py-1.5 text-sm rounded-lg transition-colors"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
          title="Recalculate all stats from practice history"
        >
          {recalcMutation.isPending ? 'Recalculating...' : 'Recalculate'}
        </button>
      </div>

      {recalcMutation.isSuccess && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            backgroundColor: 'var(--status-mastered-bg)',
            border: '1px solid var(--status-mastered-border)',
            color: 'var(--status-mastered-border)',
          }}
        >
          Stats recalculated successfully.
        </div>
      )}

      {/* Section 1: Hero Stats */}
      <HeroStatsBar
        streak={streakQuery.data ?? undefined}
        summary={compoundStatsQuery.data?.summary}
      />

      {/* Attention callout (if struggling compounds exist) */}
      {strugglingQuery.data && strugglingQuery.data.length > 0 && (
        <AttentionCallout struggling={strugglingQuery.data} />
      )}

      {/* Section 2: Achievements */}
      {achievementsQuery.data && (
        <AchievementsSection
          achievements={achievementsQuery.data.achievements}
          summary={achievementsQuery.data.summary}
        />
      )}
      {achievementsQuery.isError && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            backgroundColor: 'var(--status-struggling-bg)',
            border: '1px solid color-mix(in srgb, var(--status-struggling-border) 50%, transparent)',
            color: 'var(--status-struggling-border)',
          }}
        >
          Could not load achievements.
        </div>
      )}

      {/* Section 3: Exercise Progress */}
      {compoundStatsQuery.data && (
        <ExerciseProgressSection
          compounds={compoundStatsQuery.data.compounds}
          entries={historyQuery.data ?? []}
          options={optionsQuery.data}
        />
      )}
      {compoundStatsQuery.isError && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            backgroundColor: 'var(--status-struggling-bg)',
            border: '1px solid color-mix(in srgb, var(--status-struggling-border) 50%, transparent)',
            color: 'var(--status-struggling-border)',
          }}
        >
          Could not load exercise data.
        </div>
      )}

      {/* Section 4: Recent Practice Timeline */}
      <RecentPracticeTimeline
        entries={historyQuery.data ?? []}
        options={optionsQuery.data}
        totalAvailable={historyQuery.data?.length ?? 0}
      />
      {historyQuery.isError && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            backgroundColor: 'var(--status-struggling-bg)',
            border: '1px solid color-mix(in srgb, var(--status-struggling-border) 50%, transparent)',
            color: 'var(--status-struggling-border)',
          }}
        >
          Could not load practice history.
        </div>
      )}
    </div>
  );
}
