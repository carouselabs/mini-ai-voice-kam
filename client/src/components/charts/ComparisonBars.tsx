import type { Breakdown } from '@shared/analytics.ts'
import type { Period } from '@shared/records.ts'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { ChartFrame } from './ChartFrame'
import { TooltipCard } from './ChartTooltip'
import { AXIS_TICK, CHART } from './theme'

interface ComparisonBarsProps {
  data: Breakdown[]
  periods: { previous: Period; current: Period }
  /** What is being counted, e.g. "cancellations". */
  noun: string
  format?: (value: number) => string
}

/** Horizontal bars per category, this month against last month, one axis. */
export function ComparisonBars({ data, periods, noun, format = String }: ComparisonBarsProps) {
  const reducedMotion = useReducedMotion()
  const height = Math.max(160, data.length * 34 + 30)
  const current = periods.current.shortLabel
  const previous = periods.previous.shortLabel
  return (
    <ChartFrame
      height={height}
      summary={`${noun} by type: ${data.map((d) => `${d.key} ${d.current} (was ${d.previous})`).join('; ')}.`}
      legend={[
        { label: current, color: CHART.current, shape: 'block' },
        { label: previous, color: CHART.previousFill, shape: 'block' },
      ]}
      table={{ headers: ['Type', current, previous], rows: data.map((d) => [d.key, format(d.current), format(d.previous)]) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v: number) => format(v)} />
          <YAxis type="category" dataKey="key" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} width={150} />
          <Tooltip
            cursor={{ fill: 'rgb(95 47 214 / 0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as Breakdown
              return (
                <TooltipCard
                  title={row.key}
                  rows={[
                    { label: current, value: format(row.current), color: CHART.current },
                    { label: previous, value: format(row.previous), color: CHART.previous },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="current" fill={CHART.current} radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={!reducedMotion} />
          <Bar dataKey="previous" fill={CHART.previousFill} radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={!reducedMotion} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
