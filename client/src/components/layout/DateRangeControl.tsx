import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Badge } from '@/components/ui/Badge'
import { Popover } from '@/components/ui/Popover'
import { useSeller } from '@/hooks/useSeller'
import { cn } from '@/lib/cn'

/** Only the monthly comparison exists in the demo data; the other ranges are listed as coming. */
const rangeOptions = (current: string, previous: string) => [
  { id: 'month', label: current, detail: `Compared with ${previous}`, available: true },
  { id: '7d', label: 'Last 7 days', detail: '', available: false },
  { id: '30d', label: 'Last 30 days', detail: '', available: false },
  { id: '90d', label: 'Last 90 days', detail: '', available: false },
  { id: 'custom', label: 'Custom range', detail: '', available: false },
]

export function DateRangeControl() {
  const { periods } = useSeller()
  const current = periods?.current.shortLabel ?? 'This month'
  const previous = periods?.previous.shortLabel ?? 'last month'
  const options = rangeOptions(periods?.current.label ?? 'This month', periods?.previous.label ?? 'last month')
  return (
    <Popover
      label="Reporting period"
      panelClassName="sm:w-72"
      trigger={(props, open) => (
        <button
          {...props}
          type="button"
          aria-label={`Reporting period: ${current}, compared with ${previous}`}
          className={buttonClasses({ size: 'sm', className: 'max-sm:size-8 max-sm:px-0' })}
        >
          <CalendarDays aria-hidden className="size-4 text-fg-muted" strokeWidth={1.8} />
          <span className="hidden sm:inline">{current}</span>
          <span className="hidden font-normal text-fg-muted xl:inline">vs {previous}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'hidden size-3.5 text-fg-subtle transition-transform duration-150 ease-out-quint sm:block',
              open && 'rotate-180',
            )}
          />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <p className="px-2.5 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Reporting period
          </p>
          <ul>
            {options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={!option.available}
                  aria-pressed={option.available ? true : undefined}
                  onClick={close}
                  className="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors duration-150 hover:bg-ink-100 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-caption font-medium',
                        option.available ? 'text-fg' : 'text-fg-muted',
                      )}
                    >
                      {option.label}
                    </span>
                    {option.detail && <span className="block text-2xs text-fg-muted">{option.detail}</span>}
                  </span>
                  {option.available ? (
                    <Check aria-hidden className="size-4 text-brand-600" strokeWidth={2.2} />
                  ) : (
                    <Badge tone="neutral">Soon</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="mx-1 mt-1.5 border-t border-line px-1.5 pb-1.5 pt-2.5 text-2xs text-fg-muted">
            More ranges unlock when the full demo dataset is added.
          </p>
        </div>
      )}
    </Popover>
  )
}
