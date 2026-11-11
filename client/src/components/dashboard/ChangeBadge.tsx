import type { Direction, Tone } from '@shared/analytics.ts'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

const TONES: Record<Tone, string> = {
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  neutral: 'bg-ink-100 text-fg-secondary',
}

const ICONS: Record<Direction, typeof Minus> = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }

/** Direction icon + signed value + good/bad colour, so meaning never rests on colour alone. */
export function ChangeBadge({
  text,
  direction,
  tone,
  description,
}: {
  text: string
  direction: Direction
  tone: Tone
  description: string
}) {
  const Icon = ICONS[direction]
  return (
    <span
      data-tone={tone}
      className={cn('inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-1.5 text-2xs font-semibold tabular-nums', TONES[tone])}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.2} />
      <span aria-hidden>{text}</span>
      <span className="sr-only">{description}</span>
    </span>
  )
}
