import type { DailyPoint } from '@shared/analytics.ts'
import type { Period } from '@shared/records.ts'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { formatCompactCurrency, formatCount, formatCurrency, formatShortDate } from '@/lib/format'
import { ChartFrame } from './ChartFrame'
import { TooltipCard } from './ChartTooltip'
import { AXIS_TICK, CHART } from './theme'

interface DailyTrendChartProps {
  data: DailyPoint[]
  periods: { previous: Period; current: Period }
  metric: 'revenue' | 'orders'
  height?: number
}

/**
 * Day-of-month comparison on one axis. Revenue: two lines. Orders: this month as bars,
 * last month as a grey line, so the current period carries the emphasis.
 */
export function DailyTrendChart({ data, periods, metric, height = 240 }: DailyTrendChartProps) {
  const reducedMotion = useReducedMotion()
  const isRevenue = metric === 'revenue'
  const currentKey = isRevenue ? 'currentRevenue' : 'currentOrders'
  const previousKey = isRevenue ? 'previousRevenue' : 'previousOrders'
  const format = isRevenue ? formatCurrency : formatCount
  const current = periods.current.shortLabel
  const previous = periods.previous.shortLabel
  const total = (key: 'currentRevenue' | 'currentOrders' | 'previousRevenue' | 'previousOrders') =>
    data.reduce((s, d) => s + (d[key] ?? 0), 0)

  return (
    <ChartFrame
      height={height}
      summary={`${isRevenue ? 'Daily sales' : 'Daily orders'}: ${format(total(currentKey))} in ${periods.current.label} against ${format(total(previousKey))} in ${periods.previous.label}.`}
      legend={[
        { label: current, color: CHART.current, shape: isRevenue ? 'line' : 'block' },
        { label: previous, color: CHART.previous, shape: 'line' },
      ]}
      table={{
        headers: ['Day', current, previous],
        rows: data.map((d) => [d.day, d[currentKey] === null ? '—' : format(d[currentKey]!), d[previousKey] === null ? '—' : format(d[previousKey]!)]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={isRevenue ? 52 : 28}
            allowDecimals={false}
            tickFormatter={(v: number) => (isRevenue ? formatCompactCurrency(v) : String(v))}
          />
          <Tooltip
            cursor={isRevenue ? { stroke: CHART.axis } : { fill: 'rgb(95 47 214 / 0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as DailyPoint
              return (
                <TooltipCard
                  title={`Day ${point.day}`}
                  rows={[
                    ...(point.currentDate
                      ? [{ label: formatShortDate(point.currentDate), value: format(point[currentKey] ?? 0), color: CHART.current }]
                      : []),
                    ...(point.previousDate
                      ? [{ label: formatShortDate(point.previousDate), value: format(point[previousKey] ?? 0), color: CHART.previous }]
                      : []),
                  ]}
                />
              )
            }}
          />
          {isRevenue ? (
            <Line type="monotone" dataKey={currentKey} stroke={CHART.current} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={!reducedMotion} connectNulls={false} />
          ) : (
            <Bar dataKey={currentKey} fill={CHART.current} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={!reducedMotion} />
          )}
          <Line type="monotone" dataKey={previousKey} stroke={CHART.previous} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={!reducedMotion} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
