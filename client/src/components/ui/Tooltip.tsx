import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

interface Placement {
  left: number
  top: number
  transform: string
}

const GAP = 8
const HOVER_DELAY_MS = 350

function place(rect: DOMRect, side: TooltipSide): Placement {
  switch (side) {
    case 'top':
      return { left: rect.left + rect.width / 2, top: rect.top - GAP, transform: 'translate(-50%, -100%)' }
    case 'bottom':
      return { left: rect.left + rect.width / 2, top: rect.bottom + GAP, transform: 'translate(-50%, 0)' }
    case 'left':
      return { left: rect.left - GAP, top: rect.top + rect.height / 2, transform: 'translate(-100%, -50%)' }
    case 'right':
      return { left: rect.right + GAP, top: rect.top + rect.height / 2, transform: 'translate(0, -50%)' }
  }
}

interface TooltipProps {
  content: string
  side?: TooltipSide
  disabled?: boolean
  /** Classes for the wrapper. Replaces the default `inline-flex`. */
  className?: string
  children: ReactNode
}

/**
 * A visual label for mouse and keyboard users. It repeats an accessible name the
 * trigger already has (aria-label or visible text), so it is hidden from screen readers.
 * Rendered in a portal so scrolling containers never clip it.
 */
export function Tooltip({ content, side = 'top', disabled = false, className, children }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [placement, setPlacement] = useState<Placement | null>(null)

  const show = (delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const anchor = anchorRef.current?.firstElementChild ?? anchorRef.current
      if (anchor) setPlacement(place(anchor.getBoundingClientRect(), side))
    }, delay)
  }

  const hide = () => {
    window.clearTimeout(timer.current)
    setPlacement(null)
  }

  useEffect(() => {
    if (!placement) return
    const onScroll = () => setPlacement(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlacement(null)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [placement])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <span
      ref={anchorRef}
      className={className ?? 'inline-flex'}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') show(HOVER_DELAY_MS)
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) show(0)
      }}
      onBlur={hide}
    >
      {children}
      {placement &&
        !disabled &&
        createPortal(
          <span
            aria-hidden="true"
            data-tooltip=""
            className="pointer-events-none fixed z-[70] whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-2xs font-medium text-white shadow-popover transition-opacity duration-150 starting:opacity-0"
            style={placement}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  )
}
