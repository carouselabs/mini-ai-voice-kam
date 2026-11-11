import { cn } from '@/lib/cn'

interface SegmentedControlProps<T extends string> {
  label: string
  options: ReadonlyArray<{ id: T; label: string }>
  value: T
  onChange: (value: T) => void
}

/** A small set of mutually exclusive views. Buttons with aria-pressed, so it works with Tab and Space. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-control bg-ink-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'rounded-[6px] px-3 py-1 text-caption font-medium transition-[background-color,color,box-shadow] duration-150',
            value === option.id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
