import type { RealtimeHealth } from '@shared/realtime.ts'
import { useEffect, useId, useRef, useState } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { cn } from '@/lib/cn'
import { AssistantHeader } from './AssistantHeader'
import { ConversationArea } from './ConversationArea'
import { LiveVoiceView } from './LiveVoiceView'
import { MessageInput } from './MessageInput'

interface AssistantPanelProps {
  id: string
  open: boolean
  onMinimise: () => void
  onClose: () => void
}

function focusAtEnd(input: HTMLTextAreaElement | null) {
  if (!input) return
  input.focus({ preventScroll: true })
  input.setSelectionRange(input.value.length, input.value.length)
}

/** Whether live voice (OpenAI Realtime) can start. If not, the chat and browser voice keep working. */
function useRealtimeHealth(): RealtimeHealth | null {
  const [health, setHealth] = useState<RealtimeHealth | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/realtime/health')
      .then((r) => (r.ok ? (r.json() as Promise<RealtimeHealth>) : null))
      .then((h) => active && setHealth(h))
      .catch(() => active && setHealth(null))
    return () => {
      active = false
    }
  }, [])
  return health
}

/**
 * Non-modal panel over the dashboard. Stays mounted so it can animate out;
 * `inert` removes it from the tab order and accessibility tree while hidden.
 */
export function AssistantPanel({ id, open, onMinimise, onClose }: AssistantPanelProps) {
  const { sendMessage, interruptSpeech } = useAssistant()
  const titleId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const realtime = useRealtimeHealth()
  const [mode, setMode] = useState<'chat' | 'live'>('chat')

  useEffect(() => {
    // Typing is the next step on desktop. On touch screens, wait for a tap so the keyboard does not cover the panel.
    if (!open || mode !== 'chat' || window.matchMedia('(pointer: coarse)').matches) return
    const frame = requestAnimationFrame(() => focusAtEnd(inputRef.current))
    return () => cancelAnimationFrame(frame)
  }, [open, mode])

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      inert={!open}
      data-testid="assistant-panel"
      data-state={open ? 'open' : 'closed'}
      data-mode={mode}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onMinimise()
        }
      }}
      className={cn(
        'flex w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-panel sm:w-[25rem]',
        'h-[min(40rem,calc(100dvh-6.5rem))] sm:h-[min(40rem,calc(100dvh-7.5rem))]',
        'duration-200 ease-out-quint',
        // Visible at once on open (a hidden element cannot take focus on the first frame);
        // on close, visibility waits for the fade so the exit animation shows.
        open
          ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100 transition-[opacity,transform]'
          : 'pointer-events-none invisible translate-y-3 scale-[0.96] opacity-0 transition-[opacity,transform,visibility]',
      )}
    >
      <AssistantHeader
        titleId={titleId}
        onMinimise={onMinimise}
        onClose={() => {
          setMode('chat')
          onClose()
        }}
        live={mode === 'live'}
        liveAvailable={realtime?.available ?? false}
        liveReason={realtime?.reason ?? null}
        onLive={() => {
          // Only one voice at a time: stop the browser voice before the live call starts.
          interruptSpeech()
          setMode('live')
        }}
      />
      {mode === 'live' && realtime ? (
        <LiveVoiceView health={realtime} onExit={() => setMode('chat')} onNavigate={onMinimise} />
      ) : (
        <>
          <ConversationArea onSuggestion={(question) => sendMessage(question, 'text')} onNavigate={onMinimise} />
          <MessageInput inputRef={inputRef} />
        </>
      )}
    </div>
  )
}
