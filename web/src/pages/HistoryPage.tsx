import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getHistory,
  getPracticeOptions,
  updateHistoryEntry,
  deleteHistoryEntry,
  recalculateStats,
  type PracticeEntry,
  type PracticeOptions,
} from '../api/client';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface EditFormProps {
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
  onCancel: () => void;
  isLoading: boolean;
}

function EditForm({ entry, options, onSave, onCancel, isLoading }: EditFormProps) {
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

  const selectClassName =
    'w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm capitalize';

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-3 pt-3 border-t border-slate-600">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Scale</label>
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            className={selectClassName}
            disabled={isLoading}
          >
            {options.scales.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Position</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className={selectClassName}
            disabled={isLoading}
          >
            {options.positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Rhythm</label>
          <select
            value={rhythm}
            onChange={(e) => setRhythm(e.target.value)}
            className={selectClassName}
            disabled={isLoading}
          >
            {options.rhythms.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Note Pattern</label>
          <select
            value={notePattern}
            onChange={(e) => setNotePattern(e.target.value)}
            className={selectClassName}
            disabled={isLoading}
          >
            {options.notePatterns.map((np) => (
              <option key={np} value={np}>
                {np}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Key</label>
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className={selectClassName}
            disabled={isLoading}
          >
            {options.keys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">BPM</label>
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            min="1"
            max="300"
            className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

interface HistoryEntryProps {
  entry: PracticeEntry;
  options: PracticeOptions;
  onUpdate: () => void;
}

function HistoryEntry({ entry, options, onUpdate }: HistoryEntryProps) {
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
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['compoundStats'] });
      onUpdate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHistoryEntry(entry.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['compoundStats'] });
      onUpdate();
    },
  });

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-medium text-white capitalize">{entry.scale}</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">{entry.position}-shape</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300 capitalize">{entry.rhythm}</span>
            {entry.notePattern && (
              <>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300 capitalize">{entry.notePattern}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-slate-500">Key:</span>{' '}
              <span className="text-slate-300">
                {entry.key}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Pattern:</span>{' '}
              <span className="text-slate-300 font-mono">{entry.rhythmPattern}</span>
            </div>
          </div>
        </div>
        <div className="text-right ml-4">
          <div className="text-2xl font-bold text-white">{entry.bpm}</div>
          <div className="text-xs text-slate-500 uppercase">BPM</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between">
        <span className="text-xs text-slate-500">{formatDate(entry.loggedAt)}</span>
        {!isEditing && !showDeleteConfirm && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded"
            >
              Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-slate-700 rounded"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="mt-3 pt-3 border-t border-slate-600 flex items-center justify-between">
          <span className="text-sm text-red-400">Delete this entry?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded"
              disabled={deleteMutation.isPending}
            >
              Cancel
            </button>
            <button
              onClick={() => deleteMutation.mutate()}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <EditForm
          entry={entry}
          options={options}
          onSave={(data) => updateMutation.mutate(data)}
          onCancel={() => setIsEditing(false)}
          isLoading={updateMutation.isPending}
        />
      )}

      {(updateMutation.isError || deleteMutation.isError) && (
        <p className="mt-2 text-xs text-red-400">
          Error: {((updateMutation.error || deleteMutation.error) as Error).message}
        </p>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const queryClient = useQueryClient();

  const {
    data: entries,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['history'],
    queryFn: () => getHistory(50),
  });

  const { data: options } = useQuery({
    queryKey: ['practiceOptions'],
    queryFn: getPracticeOptions,
  });

  const recalcMutation = useMutation({
    mutationFn: recalculateStats,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compoundStats'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Loading history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
        <p className="text-red-300">Error loading history: {(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Practice History</h2>
        <div className="flex items-center gap-4">
          {entries && entries.length > 0 && (
            <span className="text-sm text-slate-400">{entries.length} sessions</span>
          )}
          <button
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-slate-300 text-sm rounded-lg transition-colors"
          >
            {recalcMutation.isPending ? 'Recalculating...' : 'Recalculate Stats'}
          </button>
        </div>
      </div>

      {recalcMutation.isSuccess && (
        <div className="bg-green-900/50 border border-green-700 rounded-lg p-3 text-sm text-green-300">
          Stats recalculated successfully
        </div>
      )}

      {entries && entries.length > 0 && options ? (
        <div className="space-y-3">
          {entries.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} options={options} onUpdate={() => {}} />
          ))}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <p className="text-slate-400">
            No practice history yet. Start practicing to see your history!
          </p>
        </div>
      )}
    </div>
  );
}
