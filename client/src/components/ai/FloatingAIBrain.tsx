import { useId, useRef } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { AIOrbButton } from './AIOrbButton'
import { AssistantPanel } from './AssistantPanel'
import { MinimisedBar } from './MinimisedBar'

/** Bottom-right assistant: orb, panel and minimised bar. Lives in the layout, so it survives navigation. */
export function FloatingAIBrain() {
  const { view, messages, draft, openAssistant, minimiseAssistant, closeAssistant, voice, busy } = useAssistant()
  const orbRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const minimise = () => {
    minimiseAssistant()
    orbRef.current?.focus()
  }

  const close = () => {
    closeAssistant()
    orbRef.current?.focus()
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      <AssistantPanel id={panelId} open={view === 'open'} onMinimise={minimise} onClose={close} />
      <div className="flex items-center gap-3">
        {view === 'minimised' && (
          <MinimisedBar
            questionCount={messages.filter((message) => message.author === 'seller').length}
            hasDraft={draft.trim().length > 0}
            activity={busy ? 'Investigating…' : voice.state === 'speaking' ? 'Speaking…' : voice.state === 'listening' ? 'Listening…' : null}
            onRestore={() => openAssistant()}
            onClose={close}
          />
        )}
        <AIOrbButton
          ref={orbRef}
          view={view}
          activity={busy ? 'investigating' : voice.state}
          controls={panelId}
          onClick={view === 'open' ? minimiseAssistant : () => openAssistant()}
        />
      </div>
    </div>
  )
}
