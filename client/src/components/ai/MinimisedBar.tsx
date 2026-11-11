import { ChevronUp, X } from 'lucide-react'
import { BrandOrb } from '@/components/brand/OrbitGlyph'
import { IconButton } from '@/components/ui/IconButton'

interface MinimisedBarProps {
  questionCount: number
  hasDraft: boolean
  activity: string | null
  onRestore: () => void
  onClose: () => void
}

function statusText(questionCount: number, hasDraft: boolean): string {
  if (questionCount > 0) return `${questionCount} ${questionCount === 1 ? 'question' : 'questions'} asked`
  if (hasDraft) return 'Draft saved'
  return 'Minimised'
}

export function MinimisedBar({ questionCount, hasDraft, activity, onRestore, onClose }: MinimisedBarProps) {
  const status = activity ?? statusText(questionCount, hasDraft)

  return (
    <div
      role="group"
      aria-label="Minimised assistant"
      data-testid="assistant-minimised"
      className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-popover transition-[opacity,transform] duration-200 ease-out-quint starting:translate-x-2 starting:opacity-0"
    >
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Restore assistant (${status.toLowerCase()})`}
        className="flex min-w-0 items-center gap-2.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-left transition-colors duration-150 hover:bg-ink-100"
      >
        <BrandOrb size="sm" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-caption font-semibold text-fg">Virtual KAM</span>
          <span className="block truncate text-2xs text-fg-muted">{status}</span>
        </span>
        <ChevronUp aria-hidden className="size-4 text-fg-muted" strokeWidth={2} />
      </button>
      <IconButton icon={X} label="End conversation" size="sm" tooltip="top" onClick={onClose} className="rounded-full" />
    </div>
  )
}
