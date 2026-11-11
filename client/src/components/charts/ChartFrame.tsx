import { Table2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface LegendItem {
  label: string
  color: string
  /** Line legend for series drawn as lines, block for bars. */
  shape?: 'line' | 'block'
}

interface ChartFrameProps {
  /** Accessible summary of what the chart shows. */
  summary: string
  legend?: LegendItem[]
  table: { headers: string[]; rows: Array<Array<string | number>> }
  height?: number
  children: ReactNode
}

/** Legend, chart and a table view of the same numbers, so no value depends on hovering or colour. */
export function ChartFrame({ summary, legend, table, height = 240, children }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  return (
    <figure className="min-w-0">
      {legend && legend.length > 1 && (
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-secondary">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(item.shape === 'block' ? 'size-2.5 rounded-[3px]' : 'h-0.5 w-4 rounded-full')}
                style={{ background: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div role="img" aria-label={summary} style={{ height }} className="min-w-0">
        {children}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
      <button
        type="button"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((v) => !v)}
        className="mt-2 inline-flex items-center gap-1.5 rounded text-2xs font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <Table2 aria-hidden className="size-3.5" />
        {showTable ? 'Hide table' : 'View as table'}
      </button>
      <div id={tableId} hidden={!showTable} className="mt-2 max-h-64 overflow-auto rounded-control border border-line">
        <table className="w-full text-left text-2xs">
          <thead className="sticky top-0 bg-surface-muted">
            <tr>
              {table.headers.map((h) => (
                <th key={h} scope="col" className="px-3 py-1.5 font-semibold text-fg-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-t border-line">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1 tabular-nums text-fg-secondary">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
