import { Settings } from '../../types.js';
import { Repository } from '../../db/repository.js';
import { RhythmDimension } from '../../dimensions/rhythm/index.js';
import { ScaleDimension } from '../../dimensions/scale/index.js';
import { PositionDimension } from '../../dimensions/position/index.js';
import { NotePatternDimension } from '../../dimensions/note-pattern/index.js';
import { DimensionRegistry } from '../../dimensions/registry.js';
export type DimensionsParam = {
    rhythmDim: RhythmDimension;
    scaleDim: ScaleDimension;
    positionDim: PositionDimension;
    notePatternDim: NotePatternDimension;
} | DimensionRegistry;
export interface GraphNode {
    id: string;
    type: 'compound';
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
    };
    position: {
        x: number;
        y: number;
    };
}
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type: 'smoothstep';
    data: {
        dimension: 'scale' | 'position' | 'rhythm' | 'note-pattern';
    };
    animated?: boolean;
    style?: Record<string, string | number>;
}
export interface GraphLayout {
    nodes: GraphNode[];
    edges: GraphEdge[];
    centerNodeId: string | null;
}
export declare function buildGraph(repo: Repository, settings: Settings, dimensions: DimensionsParam): GraphLayout;
export declare function buildExpandedGraph(repo: Repository, settings: Settings, dimensions: DimensionsParam): GraphLayout;
//# sourceMappingURL=graph-builder.d.ts.map