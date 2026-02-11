/**
 * Format a dimension value ID for display.
 * Replaces underscores/hyphens with spaces and title-cases each word.
 * e.g. "pentatonic_minor" → "Pentatonic Minor", "seq-3" → "Seq 3"
 */
export function formatName(s: string): string {
  if (!s) return s;
  return s
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
