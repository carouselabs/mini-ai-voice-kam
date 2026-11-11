import type { ReactNode } from 'react'

export interface TooltipRow {
  label: string
  value: string
  color: string
}

/** Tooltip body shared by all charts: a title and one row per series, values in text ink. */
export function TooltipCard({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-36 rounded-control border border-line bg-surface px-3 py-2 text-2xs shadow-popover">
      <p className="mb-1 font-semibold text-fg">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-muted">
              <span aria-hidden className="size-2 rounded-full" style={{ background: row.color }} />
              {row.label}
            </span>
            <span className="font-semibold tabular-nums text-fg">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
