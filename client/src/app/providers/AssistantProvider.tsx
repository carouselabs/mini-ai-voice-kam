import type { AiStreamEvent, AssistantReply } from '@shared/ai.ts'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { endAiSession, streamAi } from '@/lib/ai-client'
import { notifyWorkspaceChanged } from '@/lib/api'
import { createBrowserVoice, type RecognitionErrorCode } from '@/lib/voice'
import type { AssistantView } from '@/types'
import {
  AssistantContext,
  type AssistantContextValue,
  type CheckProgress,
  type ConnectionState,
  type ConversationMessage,
  type RecognitionLanguage,
  type VoiceState,
} from './assistant-context'

const MUTE_KEY = 'mini-ai.voice-muted'
const voice = createBrowserVoice()

const RECOGNITION_ERRORS: Record<RecognitionErrorCode, string> = {
  'permission-denied': 'Microphone access is blocked. Allow it from the icon in the address bar, then press Try again.',
  'no-speech': 'I didn’t catch that. Press the microphone and try again.',
  network: 'Speech recognition could not reach the browser’s speech service. Check your connection, or type instead.',
  unsupported: 'Voice input isn’t supported in this browser. Use Chrome or Edge on desktop, or type your question.',
  aborted: '',
  other: 'Something went wrong with the microphone. Try again, or type your question.',
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === 'true'
  } catch {
    return false
  }
}

const LANGUAGE_KEY = 'mini-ai.voice-language'

function readLanguage(): RecognitionLanguage {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY) === 'hi-IN' ? 'hi-IN' : 'en-IN'
  } catch {
    return 'en-IN'
  }
}

/** Remembers the speaking language in this browser (a preference only; playback is unchanged). */
function saveLanguage(language: RecognitionLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language)
  } catch {
    // Storage can be blocked; the choice still applies for this visit.
  }
}

/** Timeline of one question, in milliseconds, logged for the latency report. */
interface TurnTiming {
  via: 'voice' | 'text'
  recognitionMs: number | null
  sentAt: number
  replyMs?: number
  serverMs?: number
  modelMs?: number
  toolMs?: number
  firstSpeechMs?: number
}

function logTiming({ sentAt: _sentAt, ...timing }: TurnTiming) {
  const w = window as unknown as { __miniAiTimings?: unknown[] }
  w.__miniAiTimings = [...(w.__miniAiTimings ?? []), timing]
  console.info('[Mini AI timing]', JSON.stringify(timing))
}

let idCounter = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++idCounter}`

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AssistantView>('closed')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [draft, setDraft] = useState('')
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<CheckProgress[]>([])
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [interim, setInterim] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [muted, setMuted] = useState(readMuted)
  const [language, setLanguage] = useState<RecognitionLanguage>(readLanguage)

  const sessionId = useRef<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const stopRecognition = useRef<(() => void) | null>(null)
  const micGranted = useRef(false)
  const mutedRef = useRef(muted)
  const busyRef = useRef(false)
  const connectionRef = useRef<ConnectionState>('idle')
  const listenStartedAt = useRef<number | null>(null)
  const turnTiming = useRef<TurnTiming | null>(null)

  const recognitionSupported = useMemo(() => voice.recognitionSupported(), [])
  const synthesisSupported = useMemo(() => voice.synthesisSupported(), [])

  const setConn = (state: ConnectionState, message: string | null = null) => {
    connectionRef.current = state
    setConnection(state)
    setConnectionMessage(message)
  }
  const setBusyState = (value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }
  const addMessage = (message: Omit<ConversationMessage, 'id' | 'createdAt'>) =>
    setMessages((list) => [...list, { ...message, id: newId(message.author), createdAt: Date.now() }])

  const speak = useCallback((reply: AssistantReply) => {
    const timing = turnTiming.current
    if (mutedRef.current || !voice.synthesisSupported()) {
      if (timing) logTiming(timing)
      turnTiming.current = null
      setVoiceState('idle')
      return
    }
    voice.speak(reply.text, reply.language === 'hi' ? 'hi-IN' : 'en-IN', {
      onStart: () => {
        if (timing && timing.firstSpeechMs === undefined) {
          timing.firstSpeechMs = Math.round(performance.now() - timing.sentAt)
          logTiming(timing)
          if (turnTiming.current === timing) turnTiming.current = null
        }
        setVoiceState('speaking')
      },
      onEnd: () => setVoiceState((s) => (s === 'speaking' || s === 'waiting' || s === 'investigating' ? 'idle' : s)),
    })
    setVoiceState('speaking')
  }, [])

  /** Applies one server event. Tool events are real data checks reported by the backend. */
  const handleEvent = useCallback(
    (event: AiStreamEvent) => {
      switch (event.type) {
        case 'session':
          sessionId.current = event.sessionId
          break
        case 'tool':
          setVoiceState((s) => (s === 'speaking' ? s : 'investigating'))
          setChecks((list) =>
            event.status === 'start'
              ? [...list, { callId: event.callId, label: event.label, status: 'running' }]
              : list.map((c) => (c.callId === event.callId ? { ...c, status: event.ok === false ? 'failed' : 'done' } : c)),
          )
          break
        case 'reply':
          if (turnTiming.current) {
            turnTiming.current.replyMs = Math.round(performance.now() - turnTiming.current.sentAt)
            turnTiming.current.serverMs = event.reply.timing?.totalMs
            turnTiming.current.modelMs = event.reply.timing?.modelMs
            turnTiming.current.toolMs = event.reply.timing?.toolMs
          }
          if (connectionRef.current !== 'ready') setConn('ready')
          addMessage({ author: 'assistant', text: event.reply.text, reply: event.reply })
          speak(event.reply)
          // Mini AI may have added a tracker entry or a memory note: let open pages reload.
          if (event.reply.checks.some((c) => /tracker|Noting/.test(c))) notifyWorkspaceChanged()
          break
        case 'error':
          if (event.code === 'not_configured') {
            setConn('not_configured', event.message)
          } else if (event.code === 'not_found') {
            sessionId.current = null
            setConn('idle')
            addMessage({ author: 'system', tone: 'info', text: 'That conversation expired. Open the assistant again to start a new one.' })
          } else {
            if (connectionRef.current === 'connecting') setConn('error', event.message)
            addMessage({ author: 'system', tone: 'error', text: event.message })
          }
          setVoiceState('idle')
          break
        case 'done':
          break
      }
    },
    [speak],
  )

  const run = useCallback(
    async (path: string, body: unknown) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      setBusyState(true)
      setChecks([])
      try {
        await streamAi(path, body, handleEvent, controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'Could not reach Mini AI.'
          if (connectionRef.current === 'connecting') setConn('error', message)
          else addMessage({ author: 'system', tone: 'error', text: message })
          setVoiceState('idle')
        }
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null
          setBusyState(false)
          setVoiceState((s) => (s === 'investigating' || s === 'waiting' || s === 'processing' ? 'idle' : s))
        }
      }
    },
    [handleEvent],
  )

  const startSession = useCallback(() => {
    if (connectionRef.current === 'connecting' || connectionRef.current === 'ready') return
    setConn('connecting')
    setVoiceState('investigating')
    void run('/api/ai/sessions', {})
  }, [run])

  const sendMessage = useCallback(
    (text: string, via: 'voice' | 'text' = 'text', recognitionMs: number | null = null) => {
      const message = text.trim()
      if (!message || busyRef.current) return
      voice.cancelSpeech()
      setDraft('')
      setInterim('')
      setVoiceError(null)
      addMessage({ author: 'seller', text: message, via })
      if (connectionRef.current === 'not_configured') {
        addMessage({ author: 'system', tone: 'info', text: 'Mini AI can’t answer until a language model is configured (see the note above).' })
        setVoiceState('idle')
        return
      }
      if (!sessionId.current) {
        addMessage({ author: 'system', tone: 'error', text: 'The conversation isn’t connected. Press “Try again” above.' })
        setVoiceState('idle')
        return
      }
      setVoiceState(via === 'voice' ? 'processing' : 'waiting')
      turnTiming.current = { via, recognitionMs, sentAt: performance.now() }
      void run('/api/ai/chat', {
        sessionId: sessionId.current,
        message,
        clientMessageId: newId('msg'),
        via,
        ...(recognitionMs !== null ? { recognitionMs } : {}),
      })
    },
    [run],
  )

  const stopListening = useCallback(() => {
    stopRecognition.current?.()
  }, [])

  const interruptSpeech = useCallback(() => {
    voice.cancelSpeech()
    setVoiceState('interrupted')
    window.setTimeout(() => setVoiceState((s) => (s === 'interrupted' ? 'idle' : s)), 900)
  }, [])

  const startListening = useCallback(async () => {
    if (busyRef.current) return
    voice.cancelSpeech()
    setVoiceError(null)
    if (!voice.recognitionSupported()) {
      setVoiceError(RECOGNITION_ERRORS.unsupported)
      setVoiceState('error')
      return
    }
    if (!micGranted.current) {
      setVoiceState('requesting')
      const permission = await voice.requestMicrophone()
      if (permission === 'denied') {
        setVoiceError(RECOGNITION_ERRORS['permission-denied'])
        setVoiceState('error')
        return
      }
      micGranted.current = permission === 'granted'
    }
    setInterim('')
    stopRecognition.current = voice.listen(language, {
      onStart: () => {
        listenStartedAt.current = performance.now()
        setVoiceState('listening')
      },
      onInterim: (text) => setInterim(text),
      onFinal: (text) =>
        sendMessage(text, 'voice', listenStartedAt.current === null ? null : Math.round(performance.now() - listenStartedAt.current)),
      onError: (code) => {
        const message = RECOGNITION_ERRORS[code]
        if (message) setVoiceError(message)
        setVoiceState(code === 'aborted' || code === 'no-speech' ? 'idle' : 'error')
      },
      onEnd: () => {
        stopRecognition.current = null
        setInterim('')
        setVoiceState((s) => (s === 'listening' || s === 'requesting' ? 'idle' : s))
      },
    })
  }, [language, sendMessage])

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value
      mutedRef.current = next
      if (next) voice.cancelSpeech()
      try {
        window.localStorage.setItem(MUTE_KEY, String(next))
      } catch {
        // Storage can be blocked; the toggle still works for this visit.
      }
      return next
    })
    setVoiceState((s) => (s === 'speaking' ? 'idle' : s))
  }, [])

  const openAssistant = useCallback(
    (prefill?: string) => {
      if (prefill !== undefined) setDraft(prefill)
      setView('open')
      if (connectionRef.current === 'idle' || connectionRef.current === 'error') startSession()
    },
    [startSession],
  )

  const minimiseAssistant = useCallback(() => {
    stopRecognition.current?.()
    setView((current) => (current === 'open' ? 'minimised' : current))
  }, [])

  const closeAssistant = useCallback(() => {
    inFlight.current?.abort()
    stopRecognition.current?.()
    voice.cancelSpeech()
    if (sessionId.current) endAiSession(sessionId.current)
    sessionId.current = null
    setConn('idle')
    setBusyState(false)
    setView('closed')
    setMessages([])
    setChecks([])
    setDraft('')
    setInterim('')
    setVoiceError(null)
    setVoiceState('idle')
  }, [])

  const retryConnection = useCallback(() => {
    setConn('idle')
    startSession()
  }, [startSession])

  useEffect(
    () => () => {
      inFlight.current?.abort()
      voice.cancelSpeech()
      if (sessionId.current) endAiSession(sessionId.current)
    },
    [],
  )

  const value = useMemo<AssistantContextValue>(
    () => ({
      view,
      messages,
      draft,
      setDraft,
      openAssistant,
      minimiseAssistant,
      closeAssistant,
      sendMessage,
      connection,
      connectionMessage,
      retryConnection,
      busy,
      checks,
      voice: { state: voiceState, interim, error: voiceError, recognitionSupported, synthesisSupported, muted, language },
      startListening: () => void startListening(),
      stopListening,
      interruptSpeech,
      toggleMute,
      setVoiceLanguage: (next: RecognitionLanguage) => {
        saveLanguage(next)
        setLanguage(next)
      },
    }),
    [view, messages, draft, openAssistant, minimiseAssistant, closeAssistant, sendMessage, connection, connectionMessage, retryConnection, busy, checks, voiceState, interim, voiceError, recognitionSupported, synthesisSupported, muted, language, startListening, stopListening, interruptSpeech, toggleMute],
  )

  return <AssistantContext value={value}>{children}</AssistantContext>
}
