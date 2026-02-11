// Signature types per dimension
// Computed ID for storage
export function sigId(sig) {
    if (sig.dimension === 'rhythm') {
        return `rhythm:${sig.rhythm}:${sig.pattern}`;
    }
    if (sig.dimension === 'scale') {
        return `scale:${sig.scale}`;
    }
    if (sig.dimension === 'position') {
        return `position:${sig.position}`;
    }
    if (sig.dimension === 'note-pattern') {
        return `note-pattern:${sig.pattern}`;
    }
    throw new Error(`Unknown dimension: ${sig.dimension}`);
}
// Parse signature ID back to signature
export function parseSigId(id) {
    const parts = id.split(':');
    if (parts[0] === 'rhythm') {
        return { dimension: 'rhythm', rhythm: parts[1], pattern: parts[2] };
    }
    if (parts[0] === 'scale') {
        return { dimension: 'scale', scale: parts[1] };
    }
    if (parts[0] === 'position') {
        return { dimension: 'position', position: parts[1] };
    }
    if (parts[0] === 'note-pattern') {
        return { dimension: 'note-pattern', pattern: parts[1] };
    }
    throw new Error(`Unknown signature ID: ${id}`);
}
// Default settings
export const DEFAULT_SETTINGS = {
    emaAlpha: 0.3,
    stability: {
        minAttempts: 3, // Need 3 attempts before considered stable (legacy)
        emaRatio: 0.90, // EMA must be >= 90% of best (legacy)
    },
    progression: {
        expansionNpm: 400, // Hit 400 NPM to unlock neighbors
        masteryNpm: 480, // Hit 480 NPM to count toward mastery
        masteryStreak: 3, // 3 consecutive at mastery NPM to master
    },
    scoring: {
        // Note: 1 repeat candidate vs many exploration candidates
        // So repeat needs higher score to overcome numbers
        proximityOneChange: 1.0,
        proximityRepeat: 2.0, // Much higher to overcome candidate count
        stabilityReady: 2.0, // Strong bonus for stable parent
        stabilityNotReady: 0.0, // Zero - don't advance if unstable!
        noveltyMaxDays: 7,
        noveltyWeight: 0.1, // Minimal novelty chasing
        explorationBonus: 0.05, // Tiny exploration bonus
    },
    compoundScoring: {
        consolidationWeight: 1.0,
        stalenessWeight: 0.8,
        readinessWeight: 0.6,
        diversityWeight: 0.2,
        stalenessSessions: 10,
        transferCoefficients: {
            position: 0.8,
            articulation: 0.7,
            rhythm: 0.6,
            'note-pattern': 0.5,
            scale: 0.4,
        },
    },
    dimensionTiers: [
        // Tier 0: Always available
        { name: 'scale', tier: 0, entryPoint: 'pentatonic' },
        { name: 'position', tier: 0, entryPoint: 'E' },
        { name: 'rhythm', tier: 0, entryPoint: '8ths' },
        // Tier 1: Unlocks after 5 Tier 0 compounds expanded
        { name: 'note-pattern', tier: 1, unlockRequirement: 5, entryPoint: 'stepwise' },
        // Tier 2: Unlocks after 5 Tier 1 compounds expanded
        { name: 'articulation', tier: 2, unlockRequirement: 5, entryPoint: 'continuous' },
    ],
    // NPM tier thresholds - progress follows logarithmic curve
    npmTiers: {
        struggling: 200, // < 200 = struggling, needs to move back
        developing: 280, // 200-280 = working through things
        progressing: 400, // 280-400 = making progress
        fast: 440, // 400-440 = getting fast
        veryFast: 480, // 440-480 = getting really fast
        superFast: 560, // 480-560 = super fast, 560+ = shredding
    },
    struggling: {
        streakThreshold: 1, // 1 attempt below struggling threshold triggers warning
    },
    keys: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
};
//# sourceMappingURL=types.js.map