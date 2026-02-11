// Convert BPM to Notes Per Minute (NPM) based on rhythm grid
// This normalizes tempo across different note subdivisions
export function bpmToNpm(bpm: number, notesPerBeat: number): number {
  return bpm * notesPerBeat;
}

// Convert NPM back to BPM for display
export function npmToBpm(npm: number, notesPerBeat: number): number {
  return npm / notesPerBeat;
}

// Calculate EMA (Exponential Moving Average)
// alpha = smoothing factor (0-1), higher = more weight on current value
export function calculateEma(currentEma: number, newValue: number, alpha: number): number {
  if (currentEma === 0) {
    return newValue; // First value becomes the EMA
  }
  return alpha * newValue + (1 - alpha) * currentEma;
}

// Check if a signature is "stable" based on stats
export function isStable(
  attempts: number,
  emaNpm: number,
  bestNpm: number,
  minAttempts: number,
  emaRatio: number,
): boolean {
  if (attempts < minAttempts) {
    return false;
  }
  if (bestNpm === 0) {
    return false;
  }
  return emaNpm >= emaRatio * bestNpm;
}
