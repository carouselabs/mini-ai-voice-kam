import { CircleAlert, Inbox, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/** Holds space while data loads. Announced once to screen readers; the shimmer is visual only. */
export function LoadingBlock({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-2.5 py-2', className)}>
      <span className="sr-only">{label}</span>
      {[100, 92, 96, 70].map((width, i) => (
        <span
          key={i}
          aria-hidden
          className="block h-3 animate-pulse rounded-full bg-ink-100 motion-reduce:animate-none"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 py-8 text-center', className)}>
      <span className="grid size-10 place-items-center rounded-full bg-negative-soft text-negative">
        <CircleAlert aria-hidden className="size-5" strokeWidth={1.8} />
      </span>
      <div>
        <p className="text-sm font-medium text-fg">Couldn’t load this data</p>
        <p className="mt-1 text-caption text-fg-muted">{message}</p>
      </div>
      <Button size="sm" icon={RotateCcw} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function EmptyState({ title, message, className }: { title: string; message: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-10 text-center', className)}>
      <span className="grid size-10 place-items-center rounded-full bg-ink-100 text-fg-muted">
        <Inbox aria-hidden className="size-5" strokeWidth={1.8} />
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="max-w-sm text-caption text-fg-muted">{message}</p>
    </div>
  )
}
