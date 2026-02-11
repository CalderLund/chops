import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, getStrugglingCompounds } from '../api/client';

function UserSection() {
  const [newUserName, setNewUserName] = useState('');
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createUser(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setNewUserName('');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUserName.trim()) {
      createMutation.mutate(newUserName.trim());
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4">User Profiles</h3>
      <p className="text-sm text-slate-400 mb-4">
        User switching is handled via the API query parameter. Create new profiles here.
      </p>

      {isLoading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {users?.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between py-2 px-3 bg-slate-900/50 rounded"
            >
              <span className="text-white">{user.name}</span>
              <span className="text-xs text-slate-500">
                Created {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newUserName}
          onChange={(e) => setNewUserName(e.target.value)}
          placeholder="New user name"
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm"
        />
        <button
          type="submit"
          disabled={!newUserName.trim() || createMutation.isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-sm rounded-lg"
        >
          {createMutation.isPending ? 'Creating...' : 'Create'}
        </button>
      </form>
    </div>
  );
}

function StrugglingSection() {
  const { data: struggling, isLoading } = useQuery({
    queryKey: ['strugglingCompounds'],
    queryFn: getStrugglingCompounds,
  });

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-2">Exercises Needing Attention</h3>
      <p className="text-sm text-slate-400 mb-4">
        Exercises where your recent performance needs work. Practice these in the Skill Tree to
        improve.
      </p>

      {isLoading ? (
        <p className="text-slate-500">Loading...</p>
      ) : struggling && struggling.length > 0 ? (
        <div className="space-y-2">
          {struggling.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between py-2 px-3 bg-red-900/30 border border-red-800/50 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-red-400">!</span>
                <span className="text-white capitalize">{s.scale}</span>
                <span className="text-slate-500">-</span>
                <span className="text-slate-300">{s.position}</span>
                <span className="text-slate-500">-</span>
                <span className="text-slate-300 capitalize">{s.rhythm}</span>
                {s.notePattern && (
                  <>
                    <span className="text-slate-500">-</span>
                    <span className="text-slate-300 capitalize">{s.notePattern}</span>
                  </>
                )}
              </div>
              <span className="text-red-400 text-sm">
                {s.strugglingStreak} attempt{s.strugglingStreak > 1 ? 's' : ''} below threshold
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-green-400 text-sm">
          No exercises need attention. Keep up the good work!
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>

      <div className="grid gap-6">
        <StrugglingSection />
        <UserSection />
      </div>
    </div>
  );
}
