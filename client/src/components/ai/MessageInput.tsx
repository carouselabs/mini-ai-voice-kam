import { ArrowUp, Mic, RotateCcw, Square, VolumeX } from 'lucide-react'
import { useId, useLayoutEffect, type RefObject } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

const MAX_INPUT_HEIGHT = 128

export function MessageInput({ inputRef }: { inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const { draft, setDraft, sendMessage, busy, voice, startListening, stopListening, interruptSpeech, setVoiceLanguage } = useAssistant()
  const inputId = useId()
  const hintId = useId()
  const listening = voice.state === 'listening' || voice.state === 'requesting'
  const speaking = voice.state === 'speaking'
  const canSend = draft.trim().length > 0 && !busy

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [draft, inputRef])

  const submit = () => {
    if (canSend) sendMessage(draft, 'text')
  }

  const hint = voice.error
    ? voice.error
    : !voice.recognitionSupported
      ? 'Voice input needs Chrome or Edge on desktop. You can type here.'
      : listening
        ? 'Listening. Speak naturally; I’ll send when you pause.'
        : busy
          ? 'Working on it…'
          : 'Press the microphone to talk, or type. Enter sends.'

  return (
    <form
      className="shrink-0 border-t border-line bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {speaking && (
        <div className="mb-2 flex justify-center">
          <Button size="sm" icon={VolumeX} onClick={interruptSpeech}>
            Stop speaking
          </Button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          disabled={busy || !voice.recognitionSupported}
          aria-label={listening ? 'Stop listening' : 'Speak to Mini AI'}
          aria-pressed={listening}
          data-testid="mic-button"
          className={cn(
            'relative grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,transform,box-shadow] duration-150 ease-out-quint active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
            listening ? 'bg-negative-mark text-white shadow-[0_0_0_6px_rgb(208_59_59/0.18)]' : 'bg-accent text-white hover:bg-accent-hover',
          )}
        >
          {listening && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-negative-mark/40 motion-reduce:animate-none" />}
          {listening ? <Square aria-hidden className="relative size-4" fill="currentColor" /> : <Mic aria-hidden className="size-5" />}
        </button>
        <div className="flex flex-1 items-end gap-1 rounded-xl border border-line-strong bg-surface p-1 shadow-card transition-[border-color,box-shadow] duration-150 focus-within:border-brand-400 focus-within:ring-3 focus-within:ring-brand-100">
          <label htmlFor={inputId} className="sr-only">
            Message your Virtual KAM
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            rows={1}
            maxLength={1000}
            value={draft}
            aria-describedby={hintId}
            placeholder="Ask about your sales, stock or cancellations…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
            className="min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-fg outline-none placeholder:text-fg-muted"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-white transition-[background-color,transform] duration-150 ease-out-quint hover:bg-accent-hover active:scale-95 disabled:bg-ink-100 disabled:text-fg-subtle"
          >
            <ArrowUp aria-hidden className="size-[18px]" strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-1 pt-2">
        <p id={hintId} aria-live="polite" data-testid="voice-hint" className={cn('text-2xs', voice.error ? 'text-negative' : 'text-fg-muted')}>
          {hint}
          {voice.state === 'error' && voice.recognitionSupported && (
            <button type="button" onClick={startListening} className="ml-1.5 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              <RotateCcw aria-hidden className="size-3" /> Try again
            </button>
          )}
        </p>
        {voice.recognitionSupported && (
          <div role="group" aria-label="Speech language" className="flex shrink-0 rounded-full bg-ink-100 p-0.5 text-2xs">
            {(['en-IN', 'hi-IN'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={voice.language === lang}
                onClick={() => setVoiceLanguage(lang)}
                className={cn('rounded-full px-2 py-0.5 font-medium', voice.language === lang ? 'bg-surface text-fg shadow-card' : 'text-fg-muted')}
              >
                {lang === 'en-IN' ? 'English' : 'हिन्दी'}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  )
}
