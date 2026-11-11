import type { RealtimeHealth, VoiceLanguage } from '@shared/realtime.ts'
import { ArrowLeft, ArrowUp, Mic, MicOff, PhoneOff, RotateCcw, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OrbitGlyph } from '@/components/brand/OrbitGlyph'
import { Button } from '@/components/ui/Button'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'
import { LiveVoice, type LiveLine, type LiveState, type LiveToolEvent } from '@/lib/realtime'
import { notifyWorkspaceChanged } from '@/lib/api'
import { EvidenceCard } from './EvidenceCard'
import { ReplyActions } from './ReplyActions'

const LANGUAGES: Array<{ id: VoiceLanguage; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'hinglish', label: 'Hinglish' },
]
const LANGUAGE_KEY = 'mini-ai.live-language'

const STATE_LABEL: Record<LiveState, string> = {
  idle: 'Ready when you are',
  connecting: 'Connecting…',
  listening: 'Listening. Speak naturally',
  hearing: 'Hearing you…',
  thinking: 'Thinking…',
  speaking: 'Speaking. Talk any time to interrupt',
  muted: 'Microphone off',
  reconnecting: 'Connection dropped. Reconnecting…',
  error: 'Live voice stopped',
  ended: 'Call ended',
}

type Item = { kind: 'line'; line: LiveLine } | { kind: 'tool'; tool: LiveToolEvent }

function readLanguage(): VoiceLanguage {
  try {
    const v = window.localStorage.getItem(LANGUAGE_KEY)
    return v === 'en' || v === 'hi' || v === 'hinglish' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/** The orb and waveform follow the real audio levels; drawn outside React so nothing re-renders per frame. */
function useLevels(voice: LiveVoice | null, state: LiveState, orb: React.RefObject<HTMLDivElement | null>, canvas: React.RefObject<HTMLCanvasElement | null>) {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (!voice || reduced) return
    let frame = 0
    const draw = () => {
      const { mic, ai, micBins, aiBins } = voice.levels()
      const speaking = state === 'speaking'
      const level = speaking ? ai : mic
      if (orb.current) orb.current.style.transform = `scale(${1 + Math.min(level, 1) * 0.14})`
      const c = canvas.current
      const ctx = c?.getContext('2d')
      if (c && ctx) {
        const bins = (speaking ? aiBins : micBins) ?? new Uint8Array(16)
        ctx.clearRect(0, 0, c.width, c.height)
        const bars = 28
        const w = c.width / bars
        ctx.fillStyle = speaking ? '#7548ea' : '#9572f5'
        for (let i = 0; i < bars; i++) {
          const v = (bins[Math.floor((i / bars) * bins.length)] ?? 0) / 255
          const h = Math.max(3, v * c.height)
          ctx.globalAlpha = 0.35 + v * 0.65
          ctx.beginPath()
          ctx.roundRect(i * w + w * 0.2, (c.height - h) / 2, w * 0.6, h, 2)
          ctx.fill()
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [voice, state, reduced, orb, canvas])
}

/** Live voice call with Mini AI over the OpenAI Realtime API. */
export function LiveVoiceView({ health, onExit, onNavigate }: { health: RealtimeHealth; onExit: () => void; onNavigate: () => void }) {
  const [state, setState] = useState<LiveState>('idle')
  const [detail, setDetail] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [language, setLanguage] = useState<VoiceLanguage>(readLanguage)
  const [muted, setMuted] = useState(false)
  const [typed, setTyped] = useState('')
  const [toolLabel, setToolLabel] = useState<string | null>(null)
  const [voice, setVoice] = useState<LiveVoice | null>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  useLevels(voice, state, orbRef, canvasRef)

  const upsert = useCallback((next: Item) => {
    setItems((list) => {
      const id = next.kind === 'line' ? next.line.id : next.tool.callId
      const i = list.findIndex((x) => (x.kind === 'line' ? x.line.id : x.tool.callId) === id)
      if (i === -1) return [...list, next]
      const copy = list.slice()
      copy[i] = next
      return copy
    })
  }, [])

  const makeVoice = useCallback(
    () =>
      new LiveVoice({
        onState: (s, d) => {
          setState(s)
          setDetail(d ?? null)
          if (s !== 'thinking') setToolLabel(null)
        },
        onLine: (line) => upsert({ kind: 'line', line }),
        onTool: (tool) => {
          upsert({ kind: 'tool', tool })
          setToolLabel(tool.status === 'running' ? null : tool.label)
          if (tool.tracker.length) notifyWorkspaceChanged()
        },
        onError: (message) => setDetail(message),
      }),
    [upsert],
  )

  // Open the call in the background while the seller looks at this screen, so Start is near-instant. No microphone
  // and nothing spoken until Start. A language change before Start reopens it in that language.
  const prepared = useRef<LiveVoice | null>(null)
  useEffect(() => {
    if (voice) return
    const v = makeVoice()
    prepared.current = v
    v.warm(language)
    return () => {
      if (prepared.current === v) {
        prepared.current = null
        v.discard()
      }
    }
  }, [voice, language, makeVoice])

  const start = useCallback(() => {
    const v = prepared.current ?? makeVoice()
    prepared.current = null
    setVoice(v)
    setItems([])
    void v.start(language)
  }, [language, makeVoice])

  // End the call when the view closes.
  useEffect(() => () => void voice?.end(), [voice])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [items])

  const chooseLanguage = (l: VoiceLanguage) => {
    setLanguage(l)
    try {
      window.localStorage.setItem(LANGUAGE_KEY, l)
    } catch {
      // the choice still applies to this call
    }
    if (voice && !['idle', 'ended', 'error'].includes(state)) void voice.setLanguage(l)
  }

  const inCall = voice !== null && !['idle', 'ended', 'error'].includes(state)
  const label = state === 'thinking' && toolLabel ? `${toolLabel}…` : state === 'error' && detail ? detail : STATE_LABEL[state]
  const active = state === 'listening' || state === 'hearing' || state === 'speaking'

  return (
    <div data-testid="live-voice" data-state={state} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onExit}>
          Chat
        </Button>
        <div role="group" aria-label="Reply language" className="ml-auto flex rounded-full bg-ink-100 p-0.5 text-2xs">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={language === l.id}
              onClick={() => chooseLanguage(l.id)}
              className={cn('rounded-full px-2 py-1 font-medium transition-colors', language === l.id ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg')}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2 px-4 pb-2 pt-4">
        <div className="relative grid size-28 place-items-center">
          {active && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand-200/40 [animation-duration:2.4s] motion-reduce:hidden" />}
          <div
            ref={orbRef}
            aria-hidden
            className={cn(
              'orb-sphere relative grid size-24 place-items-center rounded-full text-white transition-[filter] duration-300 will-change-transform',
              (state === 'muted' || state === 'error' || state === 'ended' || state === 'idle') && 'saturate-50',
              state === 'thinking' && 'animate-orb-breathe motion-reduce:animate-none',
            )}
          >
            <span className="orb-specular absolute inset-0 rounded-full" />
            <OrbitGlyph animated={state === 'thinking' || state === 'connecting'} className="relative size-11" />
          </div>
        </div>
        <canvas ref={canvasRef} width={224} height={28} aria-hidden className={cn('h-7 w-56', !active && 'opacity-30')} />
        <p data-testid="live-status" role="status" aria-live="polite" className={cn('text-center text-caption font-medium', state === 'error' ? 'text-negative' : 'text-fg-secondary')}>
          {label}
        </p>
        <p className="text-center text-2xs text-fg-muted">
          {health.model ? `OpenAI ${health.model} · voice ${health.voice}` : ''}
        </p>
      </div>

      <div ref={logRef} role="log" aria-label="Live transcript" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {state === 'idle' && (
          <div className="rounded-control bg-surface-muted p-3 text-caption text-fg-secondary">
            <p className="font-medium text-fg">Talk to Mini AI like a phone call.</p>
            <p className="mt-1">
              No button per sentence: speak, pause, and it answers. Interrupt it any time. It checks your store data before answering, in English, Hindi or Hinglish.
            </p>
            <p className="mt-1 text-2xs text-fg-muted">Your voice goes to OpenAI for the conversation. Mini AI does not record audio.</p>
          </div>
        )}
        {items.map((item) =>
          item.kind === 'line' ? (
            <div key={item.line.id} data-testid={`live-line-${item.line.role}`} className={cn('flex', item.line.role === 'seller' ? 'justify-end' : 'justify-start')}>
              <p
                className={cn(
                  'max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm',
                  item.line.role === 'seller' ? 'rounded-br-md bg-accent text-white' : 'rounded-bl-md bg-ink-100 text-fg',
                  !item.line.final && 'opacity-80',
                )}
              >
                <span className="sr-only">{item.line.role === 'seller' ? 'You' : 'Mini AI'}: </span>
                {item.line.text || '…'}
                {item.line.interrupted && <span className="ml-1 text-2xs opacity-75">(interrupted)</span>}
              </p>
            </div>
          ) : (
            <div key={item.tool.callId} data-testid="live-tool" data-status={item.tool.status} className="space-y-1.5">
              <p className="px-1 text-2xs text-fg-muted">
                {item.tool.status === 'running' ? 'Checking your data…' : item.tool.status === 'failed' ? `${item.tool.label}: could not retrieve` : `Checked: ${item.tool.label}`}
              </p>
              {item.tool.evidence.slice(0, 2).map((card) => (
                <EvidenceCard key={card.findingId} card={card} onNavigate={onNavigate} />
              ))}
              {item.tool.tracker.length > 0 && <ReplyActions actions={[]} tracker={item.tool.tracker} onNavigate={onNavigate} />}
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-line p-3">
        {inCall ? (
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              icon={muted ? MicOff : Mic}
              aria-pressed={muted}
              onClick={() => {
                const next = !muted
                setMuted(next)
                voice?.mute(next)
              }}
            >
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button size="sm" icon={Square} disabled={state !== 'speaking'} onClick={() => voice?.stopSpeaking()}>
              Stop speaking
            </Button>
            <Button size="sm" variant="primary" icon={PhoneOff} className="bg-negative hover:bg-negative" onClick={() => void voice?.end()}>
              End call
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            {state === 'error' || state === 'ended' ? (
              <Button variant="primary" icon={RotateCcw} onClick={start}>
                {state === 'ended' ? 'Start a new call' : 'Retry'}
              </Button>
            ) : (
              <Button variant="primary" icon={Mic} onClick={start} disabled={state === 'connecting'}>
                Start live voice
              </Button>
            )}
          </div>
        )}
        {inCall && (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              voice?.sendText(typed)
              setTyped('')
            }}
          >
            <label className="sr-only" htmlFor="live-typed">
              Type instead
            </label>
            <input
              id="live-typed"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              maxLength={500}
              placeholder="Or type here"
              className="h-8 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-3 text-caption outline-none focus-visible:border-accent"
            />
            <Button size="sm" type="submit" icon={ArrowUp} aria-label="Send" disabled={!typed.trim()} />
          </form>
        )}
      </div>
    </div>
  )
}
