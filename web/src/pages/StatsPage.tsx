import { useQuery } from '@tanstack/react-query';
import { getCompoundStats, type CompoundStats } from '../api/client';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    struggling: 'bg-red-900/50 text-red-300 border-red-700',
    developing: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    progressing: 'bg-blue-900/50 text-blue-300 border-blue-700',
    fast: 'bg-cyan-900/50 text-cyan-300 border-cyan-700',
    veryFast: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    superFast: 'bg-green-900/50 text-green-300 border-green-700',
    shredding: 'bg-purple-900/50 text-purple-300 border-purple-700',
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs rounded border ${colors[status] || 'bg-slate-700 text-slate-300'}`}
    >
      {status}
    </span>
  );
}

function CompoundRow({ compound }: { compound: CompoundStats }) {
  const statusIcon = compound.isMastered
    ? '✓'
    : compound.strugglingStreak > 0
      ? '⚠'
      : compound.hasExpanded
        ? '◆'
        : '○';

  const statusColor = compound.isMastered
    ? 'text-green-400'
    : compound.strugglingStreak > 0
      ? 'text-red-400'
      : compound.hasExpanded
        ? 'text-cyan-400'
        : 'text-slate-500';

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-800/50">
      <td className="py-3 px-4">
        <span className={`${statusColor} mr-2`}>{statusIcon}</span>
        <span className="text-white capitalize">{compound.scale}</span>
      </td>
      <td className="py-3 px-4 text-slate-300">{compound.position}</td>
      <td className="py-3 px-4 text-slate-300 capitalize">{compound.rhythm}</td>
      <td className="py-3 px-4 text-slate-300 capitalize">{compound.notePattern || '-'}</td>
      <td className="py-3 px-4 text-right">
        <span className="text-white font-mono">{compound.lastBpm || '-'}</span>
        <span className="text-slate-500 text-sm ml-1">BPM</span>
      </td>
      <td className="py-3 px-4 text-right text-slate-400">{compound.attempts}</td>
      <td className="py-3 px-4">
        <StatusBadge status={compound.tier} />
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <div className={`bg-slate-800 rounded-xl p-6 border ${color}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['compoundStats'],
    queryFn: getCompoundStats,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Loading stats...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p className="text-red-300">Error loading stats: {(error as Error).message}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { compounds, summary } = data;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Progress Statistics</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Skills"
          value={summary.total}
          icon="📊"
          color="border-slate-700"
        />
        <SummaryCard label="Expanded" value={summary.expanded} icon="◆" color="border-cyan-800" />
        <SummaryCard label="Mastered" value={summary.mastered} icon="✓" color="border-green-800" />
        <SummaryCard
          label="Needs Attention"
          value={summary.struggling}
          icon="💪"
          color="border-red-800"
        />
      </div>

      {/* Progression info */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-400 mb-2">How Progression Works</h3>
        <div className="text-sm text-slate-400 space-y-1">
          <p>
            <span className="text-cyan-400 font-medium">Unlock new exercises</span> — reach the
            target BPM for your current exercise (varies by rhythm type)
          </p>
          <p>
            <span className="text-green-400 font-medium">Master an exercise</span> — hit the mastery
            BPM consistently 3 times in a row
          </p>
        </div>
      </div>

      {/* Compounds table */}
      {compounds.length > 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-900/50 text-left">
                  <th className="py-3 px-4 text-sm font-medium text-slate-400">Scale</th>
                  <th className="py-3 px-4 text-sm font-medium text-slate-400">Position</th>
                  <th className="py-3 px-4 text-sm font-medium text-slate-400">Rhythm</th>
                  <th className="py-3 px-4 text-sm font-medium text-slate-400">Note Pattern</th>
                  <th className="py-3 px-4 text-sm font-medium text-slate-400 text-right">
                    Last BPM
                  </th>
                  <th className="py-3 px-4 text-sm font-medium text-slate-400 text-right">
                    Attempts
                  </th>
                  <th className="py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {compounds.map((compound) => (
                  <CompoundRow key={compound.id} compound={compound} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <p className="text-slate-400">
            No practice data yet. Start practicing to see your stats!
          </p>
        </div>
      )}
    </div>
  );
}
