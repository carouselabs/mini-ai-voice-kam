import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/** A dash for a value that does not exist yet, announced as such to screen readers. */
export function NoValue() {
  return (
    <span>
      <span aria-hidden className="text-fg-subtle">
        —
      </span>
      <span className="sr-only">No data yet</span>
    </span>
  )
}

/** Explains why an area is empty and when it will fill in. */
export function PendingNote({ icon: Icon, children, className }: { icon?: LucideIcon; children: string; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-caption text-fg-muted', className)}>
      {Icon && <Icon aria-hidden className="mt-px size-4 shrink-0 text-fg-subtle" strokeWidth={1.8} />}
      <span>{children}</span>
    </p>
  )
}
