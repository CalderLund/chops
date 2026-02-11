const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Types
export interface Suggestion {
  rhythm: string;
  rhythmPattern: string;
  scale: string;
  position: string;
  notePattern: string;
  key: string;
  reasoning: string;
  generatedAt: string;
}

export interface PracticeEntry {
  id: number;
  loggedAt: string;
  bpm: number;
  npm: number;
  rhythm: string;
  rhythmPattern: string;
  scale: string;
  position: string;
  notePattern: string;
  key: string;
  reasoning?: string;
}

export interface CompoundStats {
  id: string;
  scale: string;
  position: string;
  rhythm: string;
  rhythmPattern: string;
  notePattern: string | null;
  articulation: string | null;
  bestNpm: number;
  emaNpm: number;
  lastNpm: number;
  lastBpm: number;
  attempts: number;
  hasExpanded: boolean;
  masteryStreak: number;
  isMastered: boolean;
  strugglingStreak: number;
  lastPracticed: string | null;
  tier: string;
}

export interface GraphNode {
  id: string;
  type: string;
  data: {
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
    scaleTier?: number;
    scaleTonality?: string;
    scaleUses?: string;
  };
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  data: {
    dimension: 'scale' | 'position' | 'rhythm' | 'note-pattern';
    direction: 'forward' | 'backward' | 'lateral';
  };
  style?: Record<string, string | number>;
}

export interface PracticeOptions {
  rhythms: string[];
  scales: string[];
  positions: string[];
  notePatterns: string[];
  keys: string[];
}

// Practice API
export async function generateSuggestion(): Promise<Suggestion> {
  const data = await fetchApi<{ success: boolean; suggestion: Suggestion }>('/practice/suggest', {
    method: 'POST',
  });
  return data.suggestion;
}

export async function getCurrentSuggestion(): Promise<Suggestion | null> {
  const data = await fetchApi<{ success: boolean; suggestion: Suggestion | null }>(
    '/practice/current',
  );
  return data.suggestion;
}

export async function logPractice(params: {
  bpm: number;
  rhythm?: string;
  rhythmPattern?: string;
  scale?: string;
  position?: string;
  notePattern?: string;
  key?: string;
}): Promise<PracticeEntry> {
  const data = await fetchApi<{ success: boolean; entry: PracticeEntry }>('/practice/log', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return data.entry;
}

export async function getHistory(limit = 20): Promise<PracticeEntry[]> {
  const data = await fetchApi<{ success: boolean; entries: PracticeEntry[] }>(
    `/practice/history?limit=${limit}`,
  );
  return data.entries;
}

export async function updateHistoryEntry(
  id: number,
  params: {
    bpm: number;
    rhythm: string;
    rhythmPattern?: string;
    scale: string;
    position: string;
    notePattern: string;
    key: string;
  },
): Promise<void> {
  await fetchApi(`/practice/history/${id}`, {
    method: 'PUT',
    body: JSON.stringify(params),
  });
}

export async function deleteHistoryEntry(id: number): Promise<void> {
  await fetchApi(`/practice/history/${id}`, { method: 'DELETE' });
}

export async function recalculateStats(): Promise<void> {
  await fetchApi('/practice/recalculate', { method: 'POST' });
}

export async function getPracticeOptions(): Promise<PracticeOptions> {
  const data = await fetchApi<{ success: boolean; options: PracticeOptions }>('/practice/options');
  return data.options;
}

// Stats API
export async function getCompoundStats(): Promise<{
  compounds: CompoundStats[];
  summary: {
    total: number;
    expanded: number;
    mastered: number;
    struggling: number;
    expansionNpm: number;
    masteryNpm: number;
  };
}> {
  const data = await fetchApi<{
    success: boolean;
    compounds: CompoundStats[];
    summary: {
      total: number;
      expanded: number;
      mastered: number;
      struggling: number;
      expansionNpm: number;
      masteryNpm: number;
    };
  }>('/stats/compounds');
  return { compounds: data.compounds, summary: data.summary };
}

export async function getDimensionStats(): Promise<{
  dimensions: Record<
    string,
    Array<{
      signatureId: string;
      dimension: string;
      bestNpm: number;
      emaNpm: number;
      attempts: number;
      hasExpanded: boolean;
      isMastered: boolean;
    }>
  >;
  tiers: Array<{
    name: string;
    tier: number;
    unlocked: boolean;
    unlockRequirement?: number;
    entryPoint: string;
  }>;
  thresholds: {
    expansion: number;
    mastery: number;
    struggling: number;
  };
}> {
  return fetchApi('/stats/dimensions');
}

// Skills API
export async function getStrugglingCompounds(): Promise<
  Array<{
    id: string;
    scale: string;
    position: string;
    rhythm: string;
    notePattern: string | null;
    strugglingStreak: number;
  }>
> {
  const data = await fetchApi<{
    success: boolean;
    compounds: Array<{
      id: string;
      scale: string;
      position: string;
      rhythm: string;
      notePattern: string | null;
      strugglingStreak: number;
    }>;
  }>('/skills/struggling');
  return data.compounds;
}

export async function getProficiencies(): Promise<
  Array<{
    dimension: string;
    value: string;
    declaredAt: string;
  }>
> {
  const data = await fetchApi<{
    success: boolean;
    proficiencies: Array<{
      dimension: string;
      value: string;
      declaredAt: string;
    }>;
  }>('/skills/proficiencies');
  return data.proficiencies;
}

export async function addProficiency(dimension: string, value: string): Promise<void> {
  await fetchApi('/skills/proficiencies', {
    method: 'POST',
    body: JSON.stringify({ dimension, value }),
  });
}

export async function removeProficiency(dimension: string, value: string): Promise<void> {
  await fetchApi('/skills/proficiencies', {
    method: 'DELETE',
    body: JSON.stringify({ dimension, value }),
  });
}

export async function expandCompound(compoundId: string): Promise<void> {
  await fetchApi('/skills/expand', {
    method: 'POST',
    body: JSON.stringify({ compoundId }),
  });
}

export async function unexpandCompound(compoundId: string): Promise<void> {
  await fetchApi('/skills/unexpand', {
    method: 'POST',
    body: JSON.stringify({ compoundId }),
  });
}

// Candidates API
export interface CandidateScore {
  compoundId: string;
  score: number;
  probability: number;
  changedDimension: string;
  factors: {
    consolidation: { raw: number; weighted: number };
    staleness: { raw: number; weighted: number };
    readiness: { raw: number; weighted: number };
    diversity: { raw: number; weighted: number };
  };
  recencyBoost: number;
  strugglingBoost: number;
  sourceCompoundId: string;
  stats: {
    attempts: number;
    emaNpm: number;
    hasExpanded: boolean;
    isMastered: boolean;
    strugglingStreak: number;
  } | null;
}

export interface CandidatesResponse {
  currentCompound: string;
  candidates: CandidateScore[];
}

export async function getCandidates(): Promise<CandidatesResponse> {
  const data = await fetchApi<{
    success: boolean;
    currentCompound: string;
    candidates: CandidateScore[];
  }>('/practice/candidates');
  return { currentCompound: data.currentCompound, candidates: data.candidates };
}

// Graph API
export async function getGraphLayout(
  expanded = false,
  suggest = false,
): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNodeId: string | null;
  recommendedNodeId: string | null;
  recommendedReasoning: string | null;
}> {
  const data = await fetchApi<{
    success: boolean;
    nodes: GraphNode[];
    edges: GraphEdge[];
    centerNodeId: string | null;
    recommendedNodeId: string | null;
    recommendedReasoning: string | null;
  }>(`/graph/layout?expanded=${expanded}&suggest=${suggest}`);
  return {
    nodes: data.nodes,
    edges: data.edges,
    centerNodeId: data.centerNodeId,
    recommendedNodeId: data.recommendedNodeId,
    recommendedReasoning: data.recommendedReasoning,
  };
}

// Users API
export async function getUsers(): Promise<
  Array<{
    id: number;
    name: string;
    createdAt: string;
  }>
> {
  const data = await fetchApi<{
    success: boolean;
    users: Array<{ id: number; name: string; createdAt: string }>;
  }>('/users');
  return data.users;
}

export async function createUser(name: string): Promise<{ id: number; name: string }> {
  const data = await fetchApi<{
    success: boolean;
    user: { id: number; name: string };
  }>('/users', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data.user;
}

// Node Stats API
export async function getNodeStats(id: string): Promise<{
  id: string;
  exists: boolean;
  scale?: string;
  position?: string;
  rhythm?: string;
  rhythmPattern?: string;
  notePattern?: string | null;
  bestNpm?: number;
  emaNpm?: number;
  attempts?: number;
  hasExpanded?: boolean;
  masteryStreak?: number;
  isMastered?: boolean;
  strugglingStreak?: number;
  lastPracticed?: string | null;
  tier?: string;
}> {
  const data = await fetchApi<{
    success: boolean;
    node: {
      id: string;
      exists: boolean;
      scale?: string;
      position?: string;
      rhythm?: string;
      rhythmPattern?: string;
      notePattern?: string | null;
      bestNpm?: number;
      emaNpm?: number;
      attempts?: number;
      hasExpanded?: boolean;
      masteryStreak?: number;
      isMastered?: boolean;
      strugglingStreak?: number;
      lastPracticed?: string | null;
      tier?: string;
    };
  }>(`/graph/node/${encodeURIComponent(id)}`);
  return data.node;
}

// Streak API
export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string | null;
  streakFreezes: number;
}

export async function getStreakInfo(): Promise<StreakInfo> {
  const data = await fetchApi<{ success: boolean; streak: StreakInfo }>('/stats/streak');
  return data.streak;
}

// Achievements API
export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  earned: boolean;
  earnedAt: string | null;
  progress?: number;
}

export async function getAchievements(): Promise<{
  achievements: Achievement[];
  summary: { total: number; earned: number };
}> {
  const data = await fetchApi<{
    success: boolean;
    achievements: Achievement[];
    summary: { total: number; earned: number };
  }>('/stats/achievements');
  return { achievements: data.achievements, summary: data.summary };
}
