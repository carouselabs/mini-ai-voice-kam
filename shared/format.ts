/** Display formatting shared by the API (evidence text) and the dashboard. Indian digit grouping. */

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const count = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 1 })

const MINUS = '−'

/** ₹1,35,000 */
export const formatCurrency = (value: number) => currency.format(value)
/** 1,35,000 */
export const formatCount = (value: number) => count.format(value)
/** 6.8 */
export const formatDecimal = (value: number) => decimal.format(value)
/** 0.14 → 14% */
export const formatPercent = (ratio: number) => percent.format(ratio)

function signed(value: number, magnitude: string): string {
  if (Math.abs(value) < 1e-9) return magnitude
  return `${value > 0 ? '+' : MINUS}${magnitude}`
}

/** −0.325 → "−32.5%" */
export const formatPercentChange = (ratio: number) => signed(ratio, percent.format(Math.abs(ratio)))
/** 6 → "+6 pts" */
export const formatPointChange = (points: number) => signed(points, `${decimal.format(Math.abs(points))} pts`)
/** −65000 → "−₹65,000" */
export const formatCurrencyChange = (value: number) => signed(value, currency.format(Math.abs(value)))
/** 13 → "+13" */
export const formatCountChange = (value: number) => signed(value, count.format(Math.abs(value)))

/** 2026-10-09T… → 9 Oct 2026 (IST). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso),
  )
}

/** 2026-10-09T… → 9 Oct (IST). */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso),
  )
}
