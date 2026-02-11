import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInMemoryDatabase } from '../../src/db/schema.js';
import { Repository } from '../../src/db/repository.js';
import { Engine } from '../../src/core/engine.js';
import { RhythmDimension } from '../../src/dimensions/rhythm/index.js';
import { ScaleDimension } from '../../src/dimensions/scale/index.js';
import { PositionDimension } from '../../src/dimensions/position/index.js';
import { NotePatternDimension } from '../../src/dimensions/note-pattern/index.js';
import { DEFAULT_SETTINGS } from '../../src/types.js';
import { buildGraph, buildExpandedGraph } from '../../src/api/services/graph-builder.js';

describe('API Integration Tests', () => {
  let db: ReturnType<typeof createInMemoryDatabase>;
  let repo: Repository;
  let engine: Engine;
  let dimensions: {
    rhythmDim: RhythmDimension;
    scaleDim: ScaleDimension;
    positionDim: PositionDimension;
    notePatternDim: NotePatternDimension;
  };

  beforeEach(() => {
    db = createInMemoryDatabase();
    repo = new Repository(db, 1);
    dimensions = {
      rhythmDim: new RhythmDimension(),
      scaleDim: new ScaleDimension(),
      positionDim: new PositionDimension(),
      notePatternDim: new NotePatternDimension(),
    };
    engine = new Engine(
      repo,
      dimensions.rhythmDim,
      dimensions.scaleDim,
      dimensions.positionDim,
      dimensions.notePatternDim,
      DEFAULT_SETTINGS,
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('Practice Flow', () => {
    it('should generate a suggestion', () => {
      const suggestion = engine.generateCompoundSuggestion();

      expect(suggestion).toBeDefined();
      expect(suggestion.rhythm).toBeDefined();
      expect(suggestion.scale).toBeDefined();
      expect(suggestion.position).toBeDefined();
      expect(suggestion.notePattern).toBeDefined();
      expect(suggestion.key).toBeDefined();
      expect(suggestion.reasoning).toBeDefined();
    });

    it('should log practice with all fields', () => {
      const suggestion = engine.generateCompoundSuggestion();

      const entry = engine.logCompoundPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        100, // BPM
      );

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.bpm).toBe(100);
      expect(entry.npm).toBe(200); // 100 BPM * 2 notes per beat for 8ths
      expect(entry.rhythm.rhythm).toBe(suggestion.rhythm.rhythm);
      expect(entry.scale.scale).toBe(suggestion.scale.scale);
      expect(entry.position.position).toBe(suggestion.position.position);
    });

    it('should log custom practice', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      const entry = engine.logCompoundPractice(
        rhythm,
        scale,
        position,
        notePattern,
        'C',
        120,
      );

      expect(entry).toBeDefined();
      expect(entry.bpm).toBe(120);
      expect(entry.npm).toBe(240);
      expect(entry.scale.scale).toBe('pentatonic_minor');
      expect(entry.position.position).toBe('E');
    });

    it('should retrieve practice history', () => {
      // Log a few practices
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 100);
      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'G', 110);
      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'D', 120);

      const history = repo.getRecentPractice(10);

      expect(history).toHaveLength(3);
      expect(history[0].bpm).toBe(120); // Most recent first
      expect(history[1].bpm).toBe(110);
      expect(history[2].bpm).toBe(100);
    });
  });

  describe('Stats', () => {
    it('should track compound stats after practice', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 200);

      const stats = repo.getAllCompoundStats();

      expect(stats.length).toBeGreaterThan(0);

      const compoundStats = stats[0];
      expect(compoundStats.attempts).toBe(1);
      expect(compoundStats.bestNpm).toBe(400); // 200 BPM * 2 notes
      expect(compoundStats.emaNpm).toBe(400);
      expect(compoundStats.scale).toBe('pentatonic_minor');
      expect(compoundStats.position).toBe('E');
      expect(compoundStats.rhythm).toBe('8ths');
    });

    it('should track struggling streak', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      // Log practice below struggling threshold (200 NPM = 100 BPM for 8ths)
      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 80);

      const stats = repo.getAllCompoundStats();
      const compoundStats = stats[0];

      expect(compoundStats.strugglingStreak).toBe(1);
    });

    it('should track expansion', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      // Log practice at expansion threshold (400 NPM = 200 BPM for 8ths)
      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 200);

      const stats = repo.getAllCompoundStats();
      const compoundStats = stats[0];

      expect(compoundStats.hasExpanded).toBe(true);
    });
  });

  describe('Graph Builder', () => {
    it('should build empty graph with no practice', () => {
      const graph = buildGraph(repo, DEFAULT_SETTINGS, dimensions);

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it('should build graph with practiced compounds', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 100);

      const graph = buildGraph(repo, DEFAULT_SETTINGS, dimensions);

      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].data.scale).toBe('pentatonic_minor');
      expect(graph.nodes[0].data.position).toBe('E');
      expect(graph.nodes[0].data.rhythm).toBe('8ths');
      expect(graph.nodes[0].data.status).toBe('practicing');
    });

    it('should create edges between related compounds', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale1 = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const scale2 = { dimension: 'scale' as const, scale: 'minor' }; // minor is neighbor of pentatonic
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      engine.logCompoundPractice(rhythm, scale1, position, notePattern, 'C', 200);
      engine.logCompoundPractice(rhythm, scale2, position, notePattern, 'C', 100);

      const graph = buildGraph(repo, DEFAULT_SETTINGS, dimensions);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges.length).toBeGreaterThan(0);

      const edge = graph.edges[0];
      expect(edge.data.dimension).toBe('scale');
    });

    it('should show correct node status', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      // Log at expansion level
      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 200);

      const graph = buildGraph(repo, DEFAULT_SETTINGS, dimensions);

      expect(graph.nodes[0].data.status).toBe('expanded');
      expect(graph.nodes[0].data.hasExpanded).toBe(true);
    });

    it('should include potential neighbors in expanded graph', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      // Log at expansion level to unlock neighbors
      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 200);

      const baseGraph = buildGraph(repo, DEFAULT_SETTINGS, dimensions);
      const expandedGraph = buildExpandedGraph(repo, DEFAULT_SETTINGS, dimensions);

      // Expanded graph should have more nodes (potential neighbors)
      expect(expandedGraph.nodes.length).toBeGreaterThan(baseGraph.nodes.length);

      // Check that unpracticed nodes have correct status
      const unpracticedNodes = expandedGraph.nodes.filter((n) => n.data.status === 'unpracticed');
      expect(unpracticedNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Proficiencies', () => {
    it('should add and retrieve proficiencies', () => {
      repo.setProficient('scale', 'blues');
      repo.setProficient('position', 'A');

      const proficiencies = repo.getAllProficiencies();

      expect(proficiencies).toHaveLength(2);
      expect(proficiencies.some((p) => p.dimension === 'scale' && p.value === 'blues')).toBe(true);
      expect(proficiencies.some((p) => p.dimension === 'position' && p.value === 'A')).toBe(true);
    });

    it('should remove proficiencies', () => {
      repo.setProficient('scale', 'blues');
      repo.removeProficient('scale', 'blues');

      const proficiencies = repo.getAllProficiencies();

      expect(proficiencies).toHaveLength(0);
    });
  });

  describe('Struggling Detection', () => {
    it('should detect struggling compounds', () => {
      const rhythm = { dimension: 'rhythm' as const, rhythm: '8ths', pattern: 'xx' };
      const scale = { dimension: 'scale' as const, scale: 'pentatonic_minor' };
      const position = { dimension: 'position' as const, position: 'E' };
      const notePattern = { dimension: 'note-pattern' as const, pattern: 'stepwise' };

      // Log struggling practice (below 200 NPM)
      engine.logCompoundPractice(rhythm, scale, position, notePattern, 'C', 80);

      const struggling = engine.getStrugglingCompounds();

      expect(struggling).toHaveLength(1);
      expect(struggling[0].scale).toBe('pentatonic_minor');
    });
  });
});
