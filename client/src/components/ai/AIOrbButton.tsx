import { ChevronDown } from 'lucide-react'
import type { Ref } from 'react'
import { OrbitGlyph } from '@/components/brand/OrbitGlyph'
import { Tooltip } from '@/components/ui/Tooltip'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'
import type { VoiceState } from '@/app/providers/assistant-context'
import type { AssistantView } from '@/types'

interface AIOrbButtonProps {
  ref: Ref<HTMLButtonElement>
  view: AssistantView
  /** What the assistant is doing; drives the orb's motion. */
  activity: VoiceState
  controls: string
  onClick: () => void
}

const LABELS: Record<AssistantView, string> = {
  closed: 'Talk to your Virtual KAM',
  open: 'Minimise your Virtual KAM',
  minimised: 'Resume your Virtual KAM conversation',
}

/**
 * The floating AI Brain. Idle state: a breathing glow, a slow internal swirl and a
 * satellite travelling its orbit. All motion stops under prefers-reduced-motion.
 */
export function AIOrbButton({ ref, view, activity, controls, onClick }: AIOrbButtonProps) {
  const reducedMotion = useReducedMotion()
  const open = view === 'open'

  return (
    <Tooltip
      content={view === 'minimised' ? 'Resume your conversation' : 'Talk to your Virtual KAM'}
      side="left"
      disabled={open}
      className="pointer-events-auto inline-flex"
    >
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={LABELS[view]}
        aria-expanded={open}
        aria-controls={controls}
        data-testid="ai-orb"
        data-state={view}
        data-voice={activity}
        className="group relative grid size-14 animate-orb-enter place-items-center rounded-full text-white focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand-400 sm:size-15"
      >
        <span aria-hidden className="orb-glow absolute -inset-3 animate-orb-breathe rounded-full group-data-[voice=speaking]:animate-[orb-breathe_1.2s_ease-in-out_infinite] group-data-[voice=listening]:animate-[orb-breathe_0.9s_ease-in-out_infinite]" />
        <span aria-hidden className="absolute -inset-1 hidden rounded-full border-2 border-negative-mark/70 group-data-[voice=listening]:block group-data-[voice=listening]:animate-ping motion-reduce:animate-none" />
        <span aria-hidden className={cn('absolute inset-0 transition-opacity duration-200', open && 'opacity-0')}>
          <span className="absolute inset-0 animate-orb-ring rounded-full border-2 border-brand-400" />
        </span>
        <span
          aria-hidden
          className={cn(
            'orb-sphere absolute inset-0 overflow-hidden rounded-full shadow-orb transition-transform duration-200 ease-out-quint',
            'group-hover:scale-[1.05] group-active:scale-[0.95]',
            open && 'scale-[0.94] group-hover:scale-[0.97]',
          )}
        >
          <span className="orb-swirl absolute -inset-1/4 animate-orb-swirl opacity-70 mix-blend-soft-light group-data-[voice=investigating]:animate-[orb-swirl_2.4s_linear_infinite] group-data-[voice=investigating]:opacity-100" />
          <span className="orb-specular absolute inset-0" />
        </span>
        <span
          aria-hidden
          className={cn(
            'relative transition-[opacity,transform] duration-200 ease-out-quint',
            open ? 'rotate-45 scale-50 opacity-0' : 'opacity-100',
          )}
        >
          <OrbitGlyph animated={!reducedMotion} className="size-7" />
        </span>
        <ChevronDown
          aria-hidden
          strokeWidth={2.2}
          className={cn(
            'absolute size-6 transition-[opacity,transform] duration-200 ease-out-quint',
            open ? 'opacity-100' : '-rotate-45 scale-50 opacity-0',
          )}
        />
      </button>
    </Tooltip>
  )
}
