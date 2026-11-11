import type { ResponseMeta } from '@shared/api.ts'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { ErrorState, LoadingBlock } from '@/components/ui/StateViews'
import type { ApiState } from '@/hooks/useApi'
import { formatDate } from '@/lib/format'

/** Renders loading and error states, then the content once data has arrived. */
export function Loaded<T>({
  state,
  label,
  children,
}: {
  state: ApiState<T> & { retry: () => void }
  label: string
  children: (data: T, meta: ResponseMeta) => ReactNode
}) {
  if (state.status === 'loading') {
    return (
      <Card>
        <LoadingBlock label={`Loading ${label}`} />
      </Card>
    )
  }
  if (state.status === 'error') {
    return (
      <Card>
        <ErrorState message={state.error} onRetry={state.retry} />
      </Card>
    )
  }
  return <>{children(state.data, state.meta)}</>
}

/** Where the numbers on a page come from, and how fresh they are. */
export function SourceNote({ meta, children }: { meta: ResponseMeta; children?: ReactNode }) {
  const assignment = meta.sourceTypes.includes('assignment_provided')
  return (
    <p
      data-testid="data-source-note"
      className="flex items-start gap-2 rounded-control border border-dashed border-line-strong bg-surface-muted px-3 py-2 text-caption text-fg-muted"
    >
      <Info aria-hidden className="mt-px size-4 shrink-0 text-fg-subtle" strokeWidth={1.8} />
      <span>
        <span className="font-medium text-fg-secondary">Demo data as of {formatDate(meta.lastUpdatedAt)}.</span>{' '}
        {assignment
          ? 'Figures marked “Assignment” come from the assignment brief; everything else is synthetic demo data, not Snapdeal data.'
          : 'Synthetic demo data, not Snapdeal data.'}{' '}
        {children}
      </span>
    </p>
  )
}
