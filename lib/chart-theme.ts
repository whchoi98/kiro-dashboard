'use client';

import { useTheme } from './theme';

/**
 * Chart colors CSS variables cannot reach: Recharts writes tick fills and
 * tooltip styles as SVG attributes / inline styles, which don't resolve
 * var() the way class-based utilities do. DARK values are the exact hexes
 * the charts shipped with, so the dark theme stays pixel-identical.
 * Series/accent fills stay theme-invariant on purpose.
 */
export interface ChartTheme {
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  cursorFill: string;
}

const DARK: ChartTheme = {
  tick: '#94a3b8', // slate-400
  tooltipBg: '#1e293b', // slate-800
  tooltipBorder: '#334155', // slate-700
  tooltipText: '#f1f5f9', // slate-100
  cursorFill: 'rgba(255,255,255,0.04)',
};

const LIGHT: ChartTheme = {
  tick: '#52525b',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e4e7ec',
  tooltipText: '#1f2937',
  cursorFill: 'rgba(0,0,0,0.04)',
};

export function useChartTheme(): ChartTheme {
  return useTheme().theme === 'light' ? LIGHT : DARK;
}
