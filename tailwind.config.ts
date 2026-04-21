import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kiro: {
          orange: '#f97316',
          'orange-light': '#fb923c',
          'orange-dark': '#ea580c',
        },
        dashboard: {
          bg: '#0a0e1a',
          card: '#1e293b',
          'card-hover': '#334155',
          sidebar: '#0f1629',
          border: '#334155',
        },
      },
    },
  },
  plugins: [],
};

export default config;
