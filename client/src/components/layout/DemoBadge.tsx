import { Tooltip } from '@/components/ui/Tooltip'

/** Marks the whole environment as a demonstration. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Tooltip
      content="Demonstration with sample data. Not a real seller account."
      side="bottom"
      className={className}
    >
      <span
        data-testid="demo-badge"
        className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-brand-300 bg-brand-50 px-2.5 text-2xs font-bold tracking-[0.1em] text-brand-700"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-brand-500" />
        DEMO
        <span className="sr-only">: demonstration environment with sample data, not a real seller account</span>
      </span>
    </Tooltip>
  )
}
