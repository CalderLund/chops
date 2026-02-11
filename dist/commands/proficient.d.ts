import { Repository } from '../db/repository.js';
import { Engine } from '../core/engine.js';
export interface ProficientOptions {
    dimensions: Array<{
        name: string;
        displayName: string;
        getValues: () => string[];
        getPrerequisites: (value: string) => string[];
    }>;
}
export declare function proficientCommand(repo: Repository, engine: Engine, options: ProficientOptions): Promise<void>;
//# sourceMappingURL=proficient.d.ts.map