export interface ThemeDefinition {
  label: string;
  vars: Record<string, string>;
  celebrationMessages?: string[];
}

const theme: ThemeDefinition = {
  label: 'Fretboard Noir',
  celebrationMessages: [
    'Clean runs!',
    'Frets are singing!',
    'Locked in!',
    'Tight timing!',
    'Dialed in!',
    'Tone is there!',
    'Smooth legato!',
    'Stage-ready!',
  ],
  vars: {
    '--bg-deep': '#0D0D0F',
    '--bg-surface': '#1A1A1F',
    '--bg-elevated': '#242428',
    '--border': '#2E2E34',
    '--border-accent': '#3A3A42',
    '--text-primary': '#F0EDE8',
    '--text-secondary': '#8A8680',
    '--text-muted': '#5C5954',
    '--accent-primary': '#D4A056',
    '--accent-hover': '#E0B06A',
    '--cta': '#D4A056',
    '--cta-hover': '#C4914A',
    '--status-unpracticed-bg': '#3A3A40',
    '--status-unpracticed-border': '#5C5954',
    '--status-practicing-bg': '#3D2E14',
    '--status-practicing-border': '#D4A056',
    '--status-expanded-bg': '#1A2E3D',
    '--status-expanded-border': '#4BA3C7',
    '--status-mastered-bg': '#1A3D2E',
    '--status-mastered-border': '#4BC77A',
    '--status-struggling-bg': '#3D1A1A',
    '--status-struggling-border': '#C74B4B',
    '--edge-scale': '#9B6DFF',
    '--edge-position': '#4BA3C7',
    '--edge-rhythm': '#D4A056',
    '--edge-note-pattern': '#E07BAD',
    '--graph-bg': '#0D0D0F',
    '--graph-dot': '#2E2E34',
    '--node-radius': '8px',
    '--graph-nodesep': '30',
    '--graph-ranksep': '80',
    '--panel-width': '340px',
    '--cta-gradient': 'none',
    '--graph-bg-effect': 'none',
    '--node-glow': '0 0 14px',
    '--header-gradient': 'linear-gradient(to right, #0D0D0F, #1A1A1F)',
    '--header-border-accent': 'rgba(212, 160, 86, 0.25)',
    '--font-family': "'DM Sans', Inter, system-ui, -apple-system, sans-serif",
    '--fretboard-wood': '#1F1A14',
    '--fretboard-inlay': '#2A2824',
    '--fretboard-grain': '#2A2420',
  },
};

export default theme;
