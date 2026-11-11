import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useOutsidePress } from '@/hooks/useDismiss'
import { cn } from '@/lib/cn'

export interface PopoverTriggerProps {
  ref: RefObject<HTMLButtonElement | null>
  onClick: () => void
  'aria-expanded': boolean
  'aria-controls': string
  'aria-haspopup': 'dialog'
}

interface PopoverProps {
  /** Accessible name of the panel. */
  label: string
  trigger: (props: PopoverTriggerProps, open: boolean) => ReactNode
  /** Receives a close function for links and actions inside the panel. */
  children: (close: () => void) => ReactNode
  panelClassName?: string
}

/**
 * Disclosure popover anchored under its trigger, aligned to the right edge.
 * Closes on outside press and Escape (focus returns to the trigger).
 * On phones the panel spans the screen width under the top bar.
 */
export function Popover({ label, trigger, children, panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const close = useCallback(() => setOpen(false), [])
  useOutsidePress(rootRef, open, close)

  useEffect(() => {
    if (!open) return
    panelRef.current
      ?.querySelector<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ?.focus({ preventScroll: true })
  }, [open])

  return (
    <div
      ref={rootRef}
      className="sm:relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
    >
      {trigger(
        {
          ref: triggerRef,
          onClick: () => setOpen((value) => !value),
          'aria-expanded': open,
          'aria-controls': panelId,
          'aria-haspopup': 'dialog',
        },
        open,
      )}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute inset-x-4 top-[calc(100%-0.25rem)] z-40 origin-top-right rounded-card border border-line bg-surface shadow-popover',
            'sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2',
            'transition-[opacity,transform] duration-150 ease-out-quint starting:-translate-y-1 starting:scale-[0.98] starting:opacity-0',
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
