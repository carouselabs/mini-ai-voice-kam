import { useEffect, useEffectEvent, useRef } from 'react'
import { cn } from '@/lib/cn'
import { Sidebar } from './Sidebar'

interface MobileNavProps {
  id: string
  open: boolean
  onClose: () => void
}

/** The sidebar as a slide-in drawer below the desktop breakpoint. */
export function MobileNav({ id, open, onClose }: MobileNavProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const requestClose = useEffectEvent(onClose)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      root.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <div className={cn('fixed inset-0 z-[60] lg:hidden', !open && 'pointer-events-none')} inert={!open}>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-ink-950/40 transition-opacity duration-200 ease-out-quint',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'absolute inset-y-0 left-0 w-[min(18rem,86vw)] transition-[transform,box-shadow] duration-300 ease-out-quint',
          // The shadow is removed while closed so it cannot bleed in from off-screen.
          open ? 'translate-x-0 shadow-panel' : '-translate-x-full shadow-none',
        )}
      >
        <Sidebar onNavigate={onClose} onClose={onClose} closeButtonRef={closeButtonRef} />
      </div>
    </div>
  )
}
