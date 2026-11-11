import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/IconButton'

/** A modal built on the native <dialog>, which traps focus and closes on Escape by itself. */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-panel border border-line bg-surface p-0 text-fg shadow-panel backdrop:bg-ink-950/40"
    >
      {open && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[0.9375rem] font-semibold text-fg">
                {title}
              </h2>
              {description && <div className="mt-1 text-caption text-fg-muted">{description}</div>}
            </div>
            <IconButton icon={X} label="Close" size="sm" tooltip={false} onClick={onClose} />
          </div>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export const fieldClass =
  'h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-fg shadow-card outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-brand-200'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-caption">
      <span className="font-medium text-fg-secondary">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-2xs text-fg-muted">{hint}</span>}
    </label>
  )
}
