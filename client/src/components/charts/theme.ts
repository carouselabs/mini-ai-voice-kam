/**
 * Chart colours, mirrored from styles/tokens.css (SVG attributes need concrete values).
 * Emphasis form: this month in the brand colour, last month in neutral grey.
 */
export const CHART = {
  current: '#5f2fd6', // brand-600
  previous: '#9b9bab', // ink-400
  previousFill: '#dcdce4', // ink-200
  grid: '#e7e7ed', // ink-150
  axis: '#c3c3cf', // ink-300
  tick: '#6c6c7d', // ink-500
  // Status colours (always shown with a text label)
  positive: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  negative: '#d03b3b',
  brandSoft: '#b9a2fb', // brand-300
} as const

export const AXIS_TICK = { fontSize: 11, fill: CHART.tick } as const
