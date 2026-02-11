import { describe, it, expect } from 'vitest';
import { createTestContext } from './harness.js';
import { buildGraph, buildExpandedGraph } from '../../src/api/services/graph-builder.js';
import { compoundId } from '../../src/db/compound.js';

function logPractice(
  ctx: ReturnType<typeof createTestContext>,
  scale: string,
  position: string,
  rhythm: string,
  rhythmPattern: string,
  notePattern: string,
  bpm: number,
) {
  ctx.engine.logCompoundPractice(
    { dimension: 'rhythm', rhythm, pattern: rhythmPattern },
    { dimension: 'scale', scale },
    { dimension: 'position', position },
    { dimension: 'note-pattern', pattern: notePattern },
    'E',
    bpm,
  );
}

function getDimensions(ctx: ReturnType<typeof createTestContext>) {
  return {
    rhythmDim: ctx.rhythmDim,
    scaleDim: ctx.scaleDim,
    positionDim: ctx.positionDim,
    notePatternDim: ctx.notePatternDim,
  };
}

describe('Graph Builder', () => {
  it('edges only exist between valid dimension neighbors', () => {
    // Practice pentatonic_major (tier 1) and dorian (tier 3)
    // These are NOT neighbors: pent_major.next=[major,blues_major] (tier 2, not tier 3)
    // and dorian's lower tier is tier 2, not tier 1
    const ctx = createTestContext(100);

    const base = {
      position: 'E',
      rhythm: '8ths',
      rhythmPattern: 'xx',
      notePattern: 'stepwise',
    };

    for (const scale of ['pentatonic_major', 'dorian']) {
      logPractice(ctx, scale, base.position, base.rhythm, base.rhythmPattern, base.notePattern, 120);
    }

    const graph = buildGraph(ctx.repo, ctx.settings, getDimensions(ctx));

    const pentMajorId = compoundId({ scale: 'pentatonic_major', ...base });
    const dorianId = compoundId({ scale: 'dorian', ...base });

    // pentatonic_major (tier 1) and dorian (tier 3) should NOT have an edge
    // They differ by 1 dimension (scale) but are NOT dimension neighbors:
    // - pent_major's next only reaches tier 2 (major, blues_major)
    // - dorian's lower tier is 2, not 1
    const edge = graph.edges.find(
      (e) =>
        (e.source === pentMajorId && e.target === dorianId) ||
        (e.source === dorianId && e.target === pentMajorId),
    );
    expect(edge).toBeUndefined();
  });

  it('all edges connect compounds differing by exactly 1 dimension', () => {
    const ctx = createTestContext(200);

    const compounds = [
      { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' },
      { scale: 'pentatonic_major', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' },
      { scale: 'pentatonic_minor', position: 'A', rhythm: '8ths', rhythmPattern: 'xx' },
      { scale: 'pentatonic_minor', position: 'E', rhythm: 'triplets', rhythmPattern: 'xxx' },
    ];

    for (const c of compounds) {
      logPractice(ctx, c.scale, c.position, c.rhythm, c.rhythmPattern, 'stepwise', 120);
    }

    const graph = buildGraph(ctx.repo, ctx.settings, getDimensions(ctx));

    // Every edge should connect nodes that differ by exactly 1 dimension
    for (const edge of graph.edges) {
      const sourceNode = graph.nodes.find((n) => n.id === edge.source);
      const targetNode = graph.nodes.find((n) => n.id === edge.target);
      expect(sourceNode).toBeDefined();
      expect(targetNode).toBeDefined();

      let changes = 0;
      if (sourceNode!.data.scale !== targetNode!.data.scale) changes++;
      if (sourceNode!.data.position !== targetNode!.data.position) changes++;
      if (
        sourceNode!.data.rhythm !== targetNode!.data.rhythm ||
        sourceNode!.data.rhythmPattern !== targetNode!.data.rhythmPattern
      )
        changes++;
      if (sourceNode!.data.notePattern !== targetNode!.data.notePattern) changes++;

      expect(changes).toBe(1);
    }
  });

  it('expanded graph only generates 1-hop potential nodes', () => {
    const ctx = createTestContext(300);

    logPractice(ctx, 'pentatonic_minor', 'E', '8ths', 'xx', 'stepwise', 120);

    const graph = buildExpandedGraph(ctx.repo, ctx.settings, getDimensions(ctx));

    // Every potential (unpracticed) node should differ from the practiced node by exactly 1 dimension
    const potentialNodes = graph.nodes.filter((n) => n.data.attempts === 0);
    for (const node of potentialNodes) {
      let changes = 0;
      if (node.data.scale !== 'pentatonic_minor') changes++;
      if (node.data.position !== 'E') changes++;
      if (node.data.rhythm !== '8ths' || node.data.rhythmPattern !== 'xx') changes++;
      if (node.data.notePattern !== 'stepwise') changes++;

      expect(changes).toBe(1);
    }
  });

  it('transitive reduction removes redundant edges', () => {
    // pentatonic_minor.next includes [pentatonic_major, minor, blues_minor]
    // pentatonic_major.next includes [major, blues_major]
    // All tier-1 scales are same-tier lateral neighbors of each other.
    // pent_minor → minor (forward, via next) and pent_minor → blues_minor (lateral)
    // blues_minor → minor (forward, via next)
    // So pent_minor→minor has an alternative path: pent_minor→blues_minor→minor
    // Transitive reduction should remove the direct pent_minor→minor edge.
    const ctx = createTestContext(400);

    const base = {
      position: 'E',
      rhythm: '8ths',
      rhythmPattern: 'xx',
      notePattern: 'stepwise',
    };

    for (const scale of ['pentatonic_minor', 'blues_minor', 'minor']) {
      logPractice(ctx, scale, base.position, base.rhythm, base.rhythmPattern, base.notePattern, 120);
    }

    const graph = buildGraph(ctx.repo, ctx.settings, getDimensions(ctx));

    const pentMinorId = compoundId({ scale: 'pentatonic_minor', ...base });
    const bluesMinorId = compoundId({ scale: 'blues_minor', ...base });
    const minorId = compoundId({ scale: 'minor', ...base });

    // All three nodes should exist
    expect(graph.nodes.find((n) => n.id === pentMinorId)).toBeDefined();
    expect(graph.nodes.find((n) => n.id === bluesMinorId)).toBeDefined();
    expect(graph.nodes.find((n) => n.id === minorId)).toBeDefined();

    // pent_minor → blues_minor should exist (lateral, same tier)
    const pentToBlues = graph.edges.find(
      (e) =>
        (e.source === pentMinorId && e.target === bluesMinorId) ||
        (e.source === bluesMinorId && e.target === pentMinorId),
    );
    expect(pentToBlues).toBeDefined();

    // At least one path from pent_minor to minor should exist
    // (either direct or via blues_minor)
    const hasPathToMinor =
      graph.edges.some(
        (e) =>
          (e.source === pentMinorId && e.target === minorId) ||
          (e.source === minorId && e.target === pentMinorId),
      ) ||
      graph.edges.some(
        (e) =>
          (e.source === bluesMinorId && e.target === minorId) ||
          (e.source === minorId && e.target === bluesMinorId),
      );
    expect(hasPathToMinor).toBe(true);

    // After transitive reduction, if pent_minor→blues_minor AND blues_minor→minor
    // both exist, then pent_minor→minor should be removed
    const pentToMinor = graph.edges.find(
      (e) =>
        (e.source === pentMinorId && e.target === minorId) ||
        (e.source === minorId && e.target === pentMinorId),
    );
    const bluesToMinor = graph.edges.find(
      (e) =>
        (e.source === bluesMinorId && e.target === minorId) ||
        (e.source === minorId && e.target === bluesMinorId),
    );

    // If both intermediate edges exist, the direct edge should be reduced
    if (pentToBlues && bluesToMinor) {
      expect(pentToMinor).toBeUndefined();
    }
  });

  it('no edge between non-neighbor scales even if they differ by 1 dimension', () => {
    // pentatonic_major (tier 1) and dorian (tier 3) are NOT scale neighbors
    // because neighbor access only spans 1 tier at a time
    const ctx = createTestContext(500);

    const base = {
      position: 'E',
      rhythm: '8ths',
      rhythmPattern: 'xx',
      notePattern: 'stepwise',
    };

    for (const scale of ['pentatonic_major', 'dorian']) {
      logPractice(ctx, scale, base.position, base.rhythm, base.rhythmPattern, base.notePattern, 120);
    }

    const graph = buildGraph(ctx.repo, ctx.settings, getDimensions(ctx));

    const pentMajorId = compoundId({ scale: 'pentatonic_major', ...base });
    const dorianId = compoundId({ scale: 'dorian', ...base });

    // These differ by 1 dimension (scale) but are 2 tiers apart (tier 1 vs tier 3)
    // so no edge should exist
    const edge = graph.edges.find(
      (e) =>
        (e.source === pentMajorId && e.target === dorianId) ||
        (e.source === dorianId && e.target === pentMajorId),
    );
    expect(edge).toBeUndefined();
  });
});
