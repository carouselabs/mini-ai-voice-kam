/**
 * Live voice over the OpenAI Realtime API (WebRTC). The browser gets a short-lived client secret from our server,
 * connects its microphone straight to OpenAI, and relays every function call back to our server, which runs the
 * existing Mini AI data tools. The permanent API key never reaches the browser.
 */
import type { EvidenceCard, TrackerCard } from '@shared/ai.ts'
import { detectSpokenLanguage, type RealtimeSessionResponse, type RealtimeToolResponse, type VoiceLanguage } from '@shared/realtime.ts'

export type LiveState = 'idle' | 'connecting' | 'listening' | 'hearing' | 'thinking' | 'speaking' | 'muted' | 'reconnecting' | 'error' | 'ended'

export interface LiveLine {
  id: string
  role: 'seller' | 'assistant'
  text: string
  final: boolean
  interrupted?: boolean
  via?: 'voice' | 'text'
}

export interface LiveToolEvent {
  callId: string
  name: string
  label: string
  status: 'running' | 'done' | 'failed'
  evidence: EvidenceCard[]
  tracker: TrackerCard[]
}

export interface LiveCallbacks {
  onState: (state: LiveState, detail?: string) => void
  onLine: (line: LiveLine) => void
  onTool: (event: LiveToolEvent) => void
  onError: (message: string) => void
}

/** What the voice needs from a connection. WebRTC in the app; a scripted fake in automated tests. */
export interface RealtimeConnection {
  send: (event: Record<string, unknown>) => void
  close: () => void
  remoteStream: MediaStream | null
  onEvent: (handler: (event: ServerEvent) => void) => void
  onDrop: (handler: (reason: 'failed' | 'disconnected') => void) => void
  /** Puts the microphone on a connection that was opened before the seller pressed Start. */
  attachMic?: (mic: MediaStream) => Promise<void>
}

export type ServerEvent = { type: string; [key: string]: unknown }

/** mic is null when the call is opened ahead of time; the microphone is attached on Start. */
type Connect = (session: RealtimeSessionResponse, mic: MediaStream | null) => Promise<RealtimeConnection>

declare global {
  interface Window {
    /** Automated tests only: a scripted connection used when the server is in test mode. */
    __miniAiFakeRealtime?: Connect
  }
}

/** Real WebRTC connection to OpenAI. */
const connectWebRtc: Connect = async (session, mic) => {
  const pc = new RTCPeerConnection()
  const audio = document.createElement('audio')
  audio.autoplay = true
  let remoteStream: MediaStream | null = null
  pc.ontrack = (e) => {
    remoteStream = e.streams[0]
    audio.srcObject = remoteStream
  }
  // Opened ahead of time: an audio slot with no track yet (nothing is sent), filled with the microphone on Start.
  if (mic) for (const track of mic.getAudioTracks()) pc.addTrack(track, mic)
  else pc.addTransceiver('audio', { direction: 'sendrecv' })
  const dc = pc.createDataChannel('oai-events')
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const res = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: offer.sdp,
    headers: { Authorization: `Bearer ${session.clientSecret}`, 'Content-Type': 'application/sdp' },
  })
  if (!res.ok) {
    pc.close()
    throw new Error(res.status === 401 ? 'The voice credential expired. Press Retry.' : `OpenAI did not accept the call (${res.status}).`)
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
  await new Promise<void>((resolve, reject) => {
    if (dc.readyState === 'open') return resolve()
    const timer = setTimeout(() => reject(new Error('The voice connection did not open.')), 15_000)
    dc.addEventListener('open', () => (clearTimeout(timer), resolve()), { once: true })
  })
  let eventHandler: (e: ServerEvent) => void = () => {}
  let dropHandler: (r: 'failed' | 'disconnected') => void = () => {}
  dc.addEventListener('message', (e) => {
    try {
      eventHandler(JSON.parse(e.data as string) as ServerEvent)
    } catch {
      // ignore malformed events
    }
  })
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') dropHandler('failed')
    if (pc.connectionState === 'disconnected') dropHandler('disconnected')
  })
  return {
    send: (event) => {
      if (dc.readyState === 'open') dc.send(JSON.stringify(event))
    },
    close: () => {
      dc.close()
      pc.getSenders().forEach((s) => s.track?.stop())
      pc.close()
      audio.srcObject = null
    },
    get remoteStream() {
      return remoteStream
    },
    onEvent: (h) => (eventHandler = h),
    onDrop: (h) => (dropHandler = h),
    attachMic: async (m) => {
      const track = m.getAudioTracks()[0]
      const sender = pc.getSenders().find((s) => !s.track || s.track.kind === 'audio')
      if (track && sender) await sender.replaceTrack(track)
    },
  }
}

/** A call opened ahead of time is used only if Start comes within this long; otherwise a fresh one is opened. */
const WARM_MAX_MS = 10 * 60_000

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.status === 204) return undefined as T
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`)
  return json as T
}

const log = (kind: string, data: Record<string, unknown>) => console.info('[Mini AI realtime]', JSON.stringify({ kind, ...data }))

/** One live call. Create it from a click (microphone and audio playback need a user gesture). */
export class LiveVoice {
  private cb: LiveCallbacks
  private conn: RealtimeConnection | null = null
  private mic: MediaStream | null = null
  private session: RealtimeSessionResponse | null = null
  private language: VoiceLanguage = 'auto'
  private state: LiveState = 'idle'
  private muted = false
  private ended = false
  private reconnects = 0
  private handledCalls = new Set<string>()
  private lines: LiveLine[] = []
  private assistantLine = new Map<string, LiveLine>()
  private sellerLine = new Map<string, LiveLine>()
  private audioCtx: AudioContext | null = null
  private micAnalyser: AnalyserNode | null = null
  private aiAnalyser: AnalyserNode | null = null
  // Timing marks (performance.now)
  private t = { speechStopped: 0, textSent: 0, responseCreated: 0, interruptAt: 0, toolMs: 0 }
  private respondingSince = 0
  /** Token usage from response.done, for the cost estimate. */
  usage = { inputAudio: 0, inputText: 0, cachedInput: 0, outputAudio: 0, outputText: 0, responses: 0 }

  constructor(callbacks: LiveCallbacks) {
    this.cb = callbacks
  }

  private setState(state: LiveState, detail?: string) {
    if (this.ended && state !== 'ended') return
    this.state = state
    this.cb.onState(state, detail)
  }

  get current() {
    return this.state
  }

  /** Microphone and AI audio levels (0–1) for the orb and waveform. */
  levels(): { mic: number; ai: number; micBins: Uint8Array | null; aiBins: Uint8Array | null } {
    const read = (a: AnalyserNode | null) => {
      if (!a) return { level: 0, bins: null }
      const bins = new Uint8Array(a.frequencyBinCount)
      a.getByteFrequencyData(bins)
      let sum = 0
      for (const b of bins) sum += b
      return { level: Math.min(1, sum / bins.length / 110), bins }
    }
    const mic = read(this.muted ? null : this.micAnalyser)
    const ai = read(this.aiAnalyser)
    return { mic: mic.level, ai: ai.level, micBins: mic.bins, aiBins: ai.bins }
  }

  /* ---------- Opening the call ahead of time ---------- */

  private warming: Promise<boolean> | null = null
  private warmedAt = 0
  private warmedLanguage: VoiceLanguage | null = null
  private warmTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Opens the call in the background as soon as the live view is shown (credential + connection to OpenAI, no
   * microphone, nothing spoken, no tokens used), so pressing Start only switches the microphone on and greets.
   * On a slow network this hides most of the set-up time. If anything fails, Start simply connects normally.
   */
  warm(language: VoiceLanguage) {
    if (this.conn || this.warming || this.state !== 'idle') return
    this.language = language
    const started = performance.now()
    this.warming = (async () => {
      try {
        const session = await this.requestSession(null)
        await this.connectTo(session, null)
        if (this.ended) {
          this.discard()
          return false
        }
        this.warmedAt = Date.now()
        this.warmedLanguage = language
        log('warmed', { warmMs: Math.round(performance.now() - started), language })
        // Not started within the time limit: close it rather than hold an idle connection.
        this.warmTimer = setTimeout(() => {
          if (this.state === 'idle') this.closeConnection()
        }, WARM_MAX_MS)
        return true
      } catch {
        this.closeConnection()
        return false
      } finally {
        this.warming = null
      }
    })()
  }

  /** Closes a call that was opened ahead of time but never started. No state change is reported. */
  discard() {
    this.ended = true
    this.closeConnection()
  }

  private closeConnection() {
    if (this.warmTimer) clearTimeout(this.warmTimer)
    this.warmTimer = null
    const id = this.session?.voiceSessionId
    this.conn?.close()
    this.conn = null
    this.session = null
    if (id) void postJson(`/api/realtime/session/${id}/end`, {}).catch(() => {})
  }

  async start(language: VoiceLanguage) {
    this.language = language
    this.ended = false
    this.setState('connecting')
    const started = performance.now()
    // The microphone and, unless the call was opened ahead of time, the credential are requested together.
    const warming = this.warming
    const ready = Boolean(this.conn) && !warming
    const sessionRequest = ready || warming ? null : this.requestSession(null)
    sessionRequest?.catch(() => {})
    try {
      this.mic ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      this.fail(denied ? 'Microphone access is blocked. Allow it in the address bar, then press Retry.' : 'No microphone was found. Connect one and press Retry, or type instead.')
      return
    }
    try {
      const warmed = (warming ? await warming : ready) && Boolean(this.conn) && Date.now() - this.warmedAt < WARM_MAX_MS
      if (warmed && this.conn) {
        if (this.warmTimer) clearTimeout(this.warmTimer)
        await this.conn.attachMic?.(this.mic)
        if (this.warmedLanguage !== language) await this.applyLanguage(language)
      } else {
        if (this.conn) this.closeConnection()
        await this.connectTo(await (sessionRequest ?? this.requestSession(null)), this.mic)
      }
      this.attachAnalysers()
      this.setState(this.muted ? 'muted' : 'listening')
      log('connected', { connectMs: Math.round(performance.now() - started), model: this.session?.model, language, openedAhead: warmed })
      this.greet()
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Could not start live voice.')
    }
  }

  private requestSession(replaces: string | null) {
    return postJson<RealtimeSessionResponse & { greeting: string }>('/api/realtime/session', { language: this.language, replaces })
  }

  private async connectTo(session: RealtimeSessionResponse & { greeting?: string }, mic: MediaStream | null) {
    const connect = session.mock ? window.__miniAiFakeRealtime : connectWebRtc
    if (!connect) throw new Error('Live voice is in test mode on this server.')
    const conn = await connect(session, mic)
    this.session = session
    this.conn = conn
    conn.onEvent((e) => void this.handle(e))
    conn.onDrop((reason) => void this.dropped(reason))
  }

  /** A fresh call with the microphone (used to reconnect after a drop). */
  private async open(replaces: string | null) {
    await this.connectTo(await this.requestSession(replaces), this.mic)
    this.attachAnalysers()
    this.setState(this.muted ? 'muted' : 'listening')
  }

  private greeting = ''
  private greet() {
    const s = this.session as (RealtimeSessionResponse & { greeting?: string }) | null
    this.greeting = s?.greeting ?? ''
    if (!this.greeting) return
    this.conn?.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: this.greeting }] } })
    this.t.textSent = performance.now()
    this.conn?.send({ type: 'response.create' })
    this.setState('thinking')
  }

  private attachAnalysers() {
    try {
      this.audioCtx ??= new AudioContext()
      if (this.mic && !this.micAnalyser) {
        this.micAnalyser = this.audioCtx.createAnalyser()
        this.micAnalyser.fftSize = 64
        this.audioCtx.createMediaStreamSource(this.mic).connect(this.micAnalyser)
      }
      const remote = this.conn?.remoteStream
      if (remote) {
        this.aiAnalyser = this.audioCtx.createAnalyser()
        this.aiAnalyser.fftSize = 64
        this.audioCtx.createMediaStreamSource(remote).connect(this.aiAnalyser)
      }
    } catch {
      // Levels are decoration; the call works without them.
    }
  }

  private async dropped(reason: 'failed' | 'disconnected') {
    if (this.ended || this.state === 'reconnecting') return
    // A call opened ahead of time dropped before Start: forget it; Start connects normally.
    if (this.state === 'idle') return this.closeConnection()
    if (reason === 'disconnected') {
      // WebRTC often recovers from a brief drop on its own.
      await new Promise((r) => setTimeout(r, 4000))
      if (this.ended || (this.state as LiveState) === 'reconnecting') return
    }
    if (this.reconnects >= 2) return this.fail('The connection dropped. Press Retry to reconnect.')
    this.reconnects++
    this.setState('reconnecting')
    log('reconnecting', { reason, attempt: this.reconnects })
    try {
      const previous = this.session?.voiceSessionId ?? null
      this.conn?.close()
      this.conn = null
      this.aiAnalyser = null
      await this.open(previous)
      this.replayContext()
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Could not reconnect.')
    }
  }

  /** After a reconnect the new call starts empty, so the recent conversation is given back to it as text. */
  private replayContext() {
    const recent = this.lines.filter((l) => l.final && l.text.trim()).slice(-8)
    for (const l of recent) {
      this.conn?.send({
        type: 'conversation.item.create',
        item: l.role === 'seller'
          ? { type: 'message', role: 'user', content: [{ type: 'input_text', text: l.text }] }
          : { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: l.text }] },
      })
    }
    this.conn?.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: '[Reconnected after a network drop] Continue the same conversation. Do not greet again.' }] } })
  }

  private fail(message: string) {
    this.setState('error', message)
    this.cb.onError(message)
  }

  private upsertLine(map: Map<string, LiveLine>, key: string, role: LiveLine['role'], update: (l: LiveLine) => void) {
    let line = map.get(key)
    if (!line) {
      line = { id: `${role}-${key}`, role, text: '', final: false, via: 'voice' }
      map.set(key, line)
      this.lines.push(line)
    }
    update(line)
    this.cb.onLine({ ...line })
    return line
  }

  private async handle(e: ServerEvent) {
    const now = performance.now()
    switch (e.type) {
      case 'input_audio_buffer.speech_started': {
        if (this.state === 'speaking' || this.respondingSince) {
          this.t.interruptAt = now
          for (const l of this.assistantLine.values()) if (!l.final) this.upsertLine(this.assistantLine, l.id.slice(10), 'assistant', (x) => (x.interrupted = true))
        }
        this.setState('hearing')
        break
      }
      case 'input_audio_buffer.speech_stopped':
        this.t.speechStopped = now
        this.setState('thinking')
        break
      case 'conversation.item.input_audio_transcription.delta':
        this.upsertLine(this.sellerLine, String(e.item_id), 'seller', (l) => (l.text += String(e.delta ?? '')))
        break
      case 'conversation.item.input_audio_transcription.completed': {
        const line = this.upsertLine(this.sellerLine, String(e.item_id), 'seller', (l) => {
          l.text = String(e.transcript ?? l.text).trim()
          l.final = true
        })
        if (line.text) {
          void this.report('seller', line.text, {})
          this.followLanguage(line.text)
        }
        break
      }
      case 'response.created':
        this.t.responseCreated = now
        this.respondingSince = now
        break
      case 'response.output_audio_transcript.delta':
        this.upsertLine(this.assistantLine, String(e.item_id), 'assistant', (l) => (l.text += String(e.delta ?? '')))
        break
      case 'response.output_audio_transcript.done':
        this.upsertLine(this.assistantLine, String(e.item_id), 'assistant', (l) => {
          l.text = String(e.transcript ?? l.text)
          l.final = true
        })
        break
      case 'output_audio_buffer.started': {
        const from = this.t.speechStopped || this.t.textSent
        const firstAudioMs = from ? Math.round(now - from) : null
        log('first_audio', { firstAudioMs, toolMs: this.t.toolMs })
        this.lastTurnTiming = { firstAudioMs: firstAudioMs ?? -1, toolMs: this.t.toolMs }
        this.t.speechStopped = 0
        this.t.textSent = 0
        this.t.toolMs = 0
        this.setState('speaking')
        break
      }
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared': {
        if (this.t.interruptAt) {
          log('interrupted', { stopMs: Math.round(now - this.t.interruptAt) })
          this.t.interruptAt = 0
        }
        if (this.state === 'speaking') this.setState(this.muted ? 'muted' : 'listening')
        break
      }
      case 'response.done':
        await this.responseDone(e)
        break
      case 'error': {
        const err = (e.error ?? {}) as { code?: string; message?: string }
        // Harmless: cancelling when nothing is playing.
        if (err.code === 'response_cancel_not_active' || err.code === 'conversation_already_has_active_response') break
        log('error', { code: err.code })
        if (err.code === 'session_expired') return this.fail('This voice call reached its time limit. Press Retry to start a new one.')
        this.cb.onError(err.message ?? 'The voice service reported an error.')
        break
      }
      default:
        break
    }
  }

  private lastTurnTiming: Record<string, number> = {}

  private async responseDone(e: ServerEvent) {
    const response = (e.response ?? {}) as {
      status?: string
      output?: Array<{ type?: string; call_id?: string; name?: string; arguments?: string; id?: string }>
      usage?: { input_token_details?: { audio_tokens?: number; text_tokens?: number; cached_tokens?: number }; output_token_details?: { audio_tokens?: number; text_tokens?: number } }
    }
    const responseMs = this.respondingSince ? Math.round(performance.now() - this.respondingSince) : 0
    this.respondingSince = 0
    const u = response.usage
    if (u) {
      this.usage.responses++
      this.usage.inputAudio += u.input_token_details?.audio_tokens ?? 0
      this.usage.inputText += u.input_token_details?.text_tokens ?? 0
      this.usage.cachedInput += u.input_token_details?.cached_tokens ?? 0
      this.usage.outputAudio += u.output_token_details?.audio_tokens ?? 0
      this.usage.outputText += u.output_token_details?.text_tokens ?? 0
    }
    // Report the finished spoken answer once, with its timing.
    for (const item of response.output ?? []) {
      if (item.type !== 'message' || !item.id) continue
      const line = this.assistantLine.get(item.id)
      if (line?.text.trim() && !line.final) this.upsertLine(this.assistantLine, item.id, 'assistant', (l) => (l.final = true))
      if (line?.text.trim()) {
        const interrupted = response.status === 'cancelled' || Boolean(line.interrupted)
        if (interrupted) this.upsertLine(this.assistantLine, item.id, 'assistant', (l) => (l.interrupted = true))
        void this.report('assistant', line.text.trim(), { ...this.lastTurnTiming, responseMs }, interrupted)
        log('turn', { status: response.status, responseMs, ...this.lastTurnTiming })
        this.lastTurnTiming = {}
      }
    }
    const calls = (response.output ?? []).filter((o) => o.type === 'function_call' && o.call_id && !this.handledCalls.has(o.call_id))
    if (!calls.length) {
      if (this.state === 'thinking' && response.status !== 'in_progress') this.setState(this.muted ? 'muted' : 'listening')
      return
    }
    this.setState('thinking')
    const toolStart = performance.now()
    const results = await Promise.all(
      calls.map(async (c) => {
        this.handledCalls.add(c.call_id!)
        this.cb.onTool({ callId: c.call_id!, name: c.name!, label: 'Checking your data', status: 'running', evidence: [], tracker: [] })
        try {
          const r = await postJson<RealtimeToolResponse>('/api/realtime/tool', {
            voiceSessionId: this.session!.voiceSessionId,
            callId: c.call_id,
            name: c.name,
            arguments: c.arguments ?? '{}',
          })
          this.cb.onTool({ callId: c.call_id!, name: c.name!, label: r.label, status: r.ok ? 'done' : 'failed', evidence: r.evidence, tracker: r.tracker })
          return { callId: c.call_id!, output: r.output }
        } catch (error) {
          this.cb.onTool({ callId: c.call_id!, name: c.name!, label: 'Data check', status: 'failed', evidence: [], tracker: [] })
          return { callId: c.call_id!, output: JSON.stringify({ error: `The data could not be retrieved: ${error instanceof Error ? error.message : 'unknown error'}` }) }
        }
      }),
    )
    this.t.toolMs += Math.round(performance.now() - toolStart)
    if (this.ended || !this.conn) return
    for (const r of results) this.conn.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: r.callId, output: r.output } })
    // One response for all the results of this turn: never two answers for one question.
    this.conn.send({ type: 'response.create' })
  }

  private async report(role: 'seller' | 'assistant', text: string, timing: Record<string, number>, interrupted = false) {
    if (!this.session) return
    await postJson('/api/realtime/transcript', { voiceSessionId: this.session.voiceSessionId, role, text, timing, interrupted }).catch(() => {})
  }

  mute(on: boolean) {
    this.muted = on
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = !on
    if (this.state === 'listening' || this.state === 'muted' || this.state === 'hearing') this.setState(on ? 'muted' : 'listening')
  }

  stopSpeaking() {
    if (!this.conn) return
    this.t.interruptAt = performance.now()
    this.conn.send({ type: 'response.cancel' })
    this.conn.send({ type: 'output_audio_buffer.clear' })
    for (const l of this.assistantLine.values()) if (!l.final) this.upsertLine(this.assistantLine, l.id.slice(10), 'assistant', (x) => (x.interrupted = true))
    this.setState(this.muted ? 'muted' : 'listening')
  }

  sendText(text: string) {
    const clean = text.trim()
    if (!clean || !this.conn) return
    const id = `typed-${Date.now()}`
    const line: LiveLine = { id: `seller-${id}`, role: 'seller', text: clean, final: true, via: 'text' }
    this.lines.push(line)
    this.cb.onLine(line)
    void this.report('seller', clean, {})
    this.followLanguage(clean)
    if (this.state === 'speaking') this.stopSpeaking()
    this.conn.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: clean }] } })
    this.t.textSent = performance.now()
    this.conn.send({ type: 'response.create' })
    this.setState('thinking')
  }

  /** The seller picked a language in the selector. "auto" goes back to following each turn. */
  async setLanguage(language: VoiceLanguage) {
    this.language = language
    this.spoken = null
    await this.applyLanguage(language)
  }

  /** In Auto mode, the language of the latest turn (detected from its transcript). */
  private spoken: Exclude<VoiceLanguage, 'auto'> | null = null

  /**
   * Auto mode: when the seller's language changes, the session gets that language's rules, so the answer that
   * follows the data check is in the seller's language (live tests showed drift to English otherwise).
   */
  private followLanguage(text: string) {
    if (this.language !== 'auto') return
    const detected = detectSpokenLanguage(text)
    if (!detected || detected === this.spoken) return
    this.spoken = detected
    void this.applyLanguage(detected, true)
  }

  private async applyLanguage(language: VoiceLanguage, detected = false) {
    if (!this.conn || !this.session) return
    try {
      const patch = await postJson<{ session: Record<string, unknown> }>('/api/realtime/language', { voiceSessionId: this.session.voiceSessionId, language })
      this.conn.send({ type: 'session.update', session: patch.session })
      log('language', { language, detected })
    } catch (error) {
      this.cb.onError(error instanceof Error ? error.message : 'Could not change the language.')
    }
  }

  async end() {
    this.ended = true
    if (this.warmTimer) clearTimeout(this.warmTimer)
    const id = this.session?.voiceSessionId
    this.conn?.close()
    this.conn = null
    for (const t of this.mic?.getTracks() ?? []) t.stop()
    this.mic = null
    this.micAnalyser = null
    this.aiAnalyser = null
    await this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
    if (id) await postJson(`/api/realtime/session/${id}/end`, {}).catch(() => {})
    log('ended', { usage: this.usage })
    this.state = 'ended'
    this.cb.onState('ended')
  }

  /** Retry after an error: a fresh call (the server ends the old one). */
  async retry() {
    this.reconnects = 0
    this.conn?.close()
    this.conn = null
    this.ended = false
    await this.start(this.language)
  }
}
