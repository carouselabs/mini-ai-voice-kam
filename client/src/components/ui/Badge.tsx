import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'brand' | 'positive' | 'negative' | 'warning' | 'outline'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-fg-secondary',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100',
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  warning: 'bg-warning-soft text-warning',
  outline: 'text-fg-secondary ring-1 ring-inset ring-line-strong',
}

interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone
  icon?: LucideIcon
}

export function Badge({ tone = 'neutral', icon: Icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-2xs font-semibold',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon aria-hidden className="size-3" strokeWidth={2.2} />}
      {children}
    </span>
  )
}
