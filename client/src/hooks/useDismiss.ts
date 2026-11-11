import { useEffect, useEffectEvent, type RefObject } from 'react'

/** Calls onDismiss when the user presses outside the element while it is active. */
export function useOutsidePress(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  const dismiss = useEffectEvent(onDismiss)

  useEffect(() => {
    if (!active) return
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return
      dismiss()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [ref, active])
}
