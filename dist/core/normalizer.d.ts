export declare function bpmToNpm(bpm: number, notesPerBeat: number): number;
export declare function npmToBpm(npm: number, notesPerBeat: number): number;
export declare function calculateEma(currentEma: number, newValue: number, alpha: number): number;
export declare function isStable(attempts: number, emaNpm: number, bestNpm: number, minAttempts: number, emaRatio: number): boolean;
//# sourceMappingURL=normalizer.d.ts.map