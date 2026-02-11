import { Repository } from '../db/repository.js';
import { Engine } from '../core/engine.js';
import { Settings } from '../types.js';
export interface StrugglingOptions {
    dimensions: Array<{
        name: string;
        displayName: string;
        getValues: () => string[];
    }>;
}
export declare function strugglingCommand(repo: Repository, engine: Engine, settings: Settings, options: StrugglingOptions): Promise<void>;
//# sourceMappingURL=struggling.d.ts.map