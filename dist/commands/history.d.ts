import { Repository } from '../db/repository.js';
import { Settings, Tonality } from '../types.js';
export interface EditOptions {
    rhythms: string[];
    scales: string[];
    tonalities: Tonality[];
    positions: string[];
    patterns: string[];
    keys: string[];
    getPatternForRhythm: (rhythm: string) => string;
}
export declare function historyCommand(repo: Repository, limit?: number): void;
export declare function interactiveHistoryCommand(repo: Repository, settings: Settings, options: EditOptions, limit?: number): Promise<void>;
//# sourceMappingURL=history.d.ts.map