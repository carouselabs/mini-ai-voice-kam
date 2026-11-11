import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/StateViews'
import { cn } from '@/lib/cn'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | null
  align?: 'start' | 'end'
  className?: string
}

export interface Filter<T> {
  id: string
  label: string
  options: string[]
  value: (row: T) => string
}

interface DataTableProps<T> {
  caption: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  search?: { placeholder: string; text: (row: T) => string }
  filters?: Filter<T>[]
  initialSort?: { id: string; direction: 'asc' | 'desc' }
  pageSize?: number
  emptyMessage?: string
  minWidth?: string
}

type Sort = { id: string; direction: 'asc' | 'desc' } | null

/** Searchable, filterable, sortable and paginated table. Scrolls sideways inside its card on narrow screens. */
export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  search,
  filters = [],
  initialSort,
  pageSize = 15,
  emptyMessage = 'Nothing matches these filters.',
  minWidth = '48rem',
}: DataTableProps<T>) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<Sort>(initialSort ?? null)
  const [page, setPage] = useState(0)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = rows.filter(
      (row) =>
        (!q || !search || search.text(row).toLowerCase().includes(q)) &&
        filters.every((f) => !filterValues[f.id] || f.value(row) === filterValues[f.id]),
    )
    const column = sort && columns.find((c) => c.id === sort.id)
    if (column?.sortValue) {
      const factor = sort!.direction === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        const x = column.sortValue!(a)
        const y = column.sortValue!(b)
        if (x === y) return 0
        if (x === null) return 1
        if (y === null) return -1
        return (x < y ? -1 : 1) * factor
      })
    }
    return list
  }, [rows, query, search, filters, filterValues, sort, columns])

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const pageRows = visible.slice(current * pageSize, current * pageSize + pageSize)
  const from = visible.length ? current * pageSize + 1 : 0
  const to = Math.min(visible.length, (current + 1) * pageSize)

  const toggleSort = (columnId: string) => {
    setPage(0)
    setSort((s) =>
      s?.id === columnId ? { id: columnId, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { id: columnId, direction: 'desc' },
    )
  }

  return (
    <div>
      {(search || filters.length > 0) && (
        <div className="flex flex-col gap-2 pb-4 sm:flex-row sm:flex-wrap sm:items-center">
          {search && (
            <div className="relative sm:w-72">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <label htmlFor={`${id}-search`} className="sr-only">
                {search.placeholder}
              </label>
              <input
                id={`${id}-search`}
                type="search"
                value={query}
                placeholder={search.placeholder}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(0)
                }}
                className="h-9 w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 text-sm text-fg shadow-card outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-fg-muted focus:border-brand-400 focus:ring-3 focus:ring-brand-100"
              />
            </div>
          )}
          {filters.map((f) => (
            <div key={f.id}>
              <label htmlFor={`${id}-${f.id}`} className="sr-only">
                {f.label}
              </label>
              <select
                id={`${id}-${f.id}`}
                value={filterValues[f.id] ?? ''}
                onChange={(e) => {
                  setFilterValues((v) => ({ ...v, [f.id]: e.target.value }))
                  setPage(0)
                }}
                className="h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-fg shadow-card outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-100 sm:w-auto"
              >
                <option value="">All {f.label.toLowerCase()}</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <p aria-live="polite" className="text-caption text-fg-muted sm:ml-auto">
            {visible.length} of {rows.length}
          </p>
        </div>
      )}

      <div className="relative -mx-5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-y border-line bg-surface-muted">
              {columns.map((c) => {
                const active = sort?.id === c.id
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'whitespace-nowrap px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-muted first:pl-5 last:pr-5',
                      c.align === 'end' && 'text-right',
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded uppercase transition-colors hover:text-fg',
                          active && 'text-fg',
                          c.align === 'end' && 'flex-row-reverse',
                        )}
                      >
                        {c.header}
                        {active ? (
                          sort!.direction === 'asc' ? (
                            <ArrowUp aria-hidden className="size-3" />
                          ) : (
                            <ArrowDown aria-hidden className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown aria-hidden className="size-3 opacity-50" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line transition-colors last:border-b-0 hover:bg-surface-muted">
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn('px-3 py-3 align-middle text-fg-secondary first:pl-5 last:pr-5', c.align === 'end' && 'text-right tabular-nums', c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && <EmptyState title="No results" message={emptyMessage} />}

      {visible.length > pageSize && (
        <nav aria-label={`${caption} pages`} className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-caption text-fg-muted">
            {from}–{to} of {visible.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              className={buttonClasses({ variant: 'ghost', size: 'sm', iconOnly: true })}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <span className="px-1 text-caption text-fg-secondary">
              Page {current + 1} of {pageCount}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              className={buttonClasses({ variant: 'ghost', size: 'sm', iconOnly: true })}
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
