/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Node status colors
        unpracticed: {
          DEFAULT: '#6B7280',
          light: '#9CA3AF',
        },
        practicing: {
          DEFAULT: '#F59E0B',
          light: '#FCD34D',
        },
        expanded: {
          DEFAULT: '#06B6D4',
          light: '#67E8F9',
        },
        mastered: {
          DEFAULT: '#10B981',
          light: '#6EE7B7',
        },
        struggling: {
          DEFAULT: '#EF4444',
          light: '#FCA5A5',
        },
        // Edge dimension colors
        edge: {
          scale: '#8B5CF6',
          position: '#3B82F6',
          rhythm: '#F97316',
          'note-pattern': '#EC4899',
        },
      },
    },
  },
  plugins: [],
};
