import { formatPercent } from '@/lib/format'

export interface Segment {
  label: string
  value: number
  color: string
}

/** One whole split into parts: a tall bar of blocks with a legend that names each part and its count. */
export function SegmentedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const visible = segments.filter((s) => s.value > 0)
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
        className="flex h-7 gap-0.5"
      >
        {visible.map((s) => (
          <span
            key={s.label}
            title={`${s.label}: ${s.value} (${formatPercent(s.value / total)})`}
            className="rounded-[4px] first:rounded-l-[6px] last:rounded-r-[6px]"
            style={{ flexGrow: s.value, flexBasis: 0, background: s.color, minWidth: 4 }}
          />
        ))}
      </div>
      <ul className="mt-4 divide-y divide-line">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between py-2 text-caption">
            <span className="flex items-center gap-2 text-fg-secondary">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums text-fg">
              <span className="font-semibold">{s.value}</span>
              <span className="ml-2 text-fg-muted">{total ? formatPercent(s.value / total) : '—'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
