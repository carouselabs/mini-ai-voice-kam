/**
 * Voice adapter over the browser's Web Speech API (speech recognition + speech synthesis).
 * Kept behind an interface so a dedicated real-time voice provider can replace it later.
 * No audio is recorded or stored by Mini AI; Chrome and Edge send recognition audio to their
 * own speech service.
 */

export type RecognitionErrorCode = 'permission-denied' | 'no-speech' | 'network' | 'unsupported' | 'aborted' | 'other'

export interface ListenHandlers {
  onStart(): void
  onInterim(text: string): void
  /** Called once per listening session with the complete final transcript (never partial speech). */
  onFinal(text: string): void
  onError(code: RecognitionErrorCode): void
  onEnd(): void
}

export interface SpeakHandlers {
  onStart(): void
  onEnd(): void
}

export interface VoiceAdapter {
  recognitionSupported(): boolean
  synthesisSupported(): boolean
  requestMicrophone(): Promise<'granted' | 'denied' | 'unavailable'>
  /** Starts listening; returns a function that stops listening. */
  listen(lang: string, handlers: ListenHandlers): () => void
  speak(text: string, lang: string, handlers: SpeakHandlers): void
  cancelSpeech(): void
}

type RecognitionCtor = new () => {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const ERRORS: Record<string, RecognitionErrorCode> = {
  'not-allowed': 'permission-denied',
  'service-not-allowed': 'permission-denied',
  'audio-capture': 'permission-denied',
  'no-speech': 'no-speech',
  network: 'network',
  aborted: 'aborted',
}

/** Splits text into sentences so speech pauses naturally and long replies are not cut off. */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const base = lang.split('-')[0].toLowerCase()
  const exact = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
  const sameLanguage = voices.filter((v) => v.lang.toLowerCase().startsWith(base))
  const preferred = (list: SpeechSynthesisVoice[]) =>
    list.find((v) => /natural|neural|google/i.test(v.name)) ?? list[0] ?? null
  return preferred(exact) ?? preferred(sameLanguage)
}

export function createBrowserVoice(): VoiceAdapter {
  let speechToken = 0

  return {
    recognitionSupported: () => recognitionCtor() !== null,
    synthesisSupported: () => typeof window.speechSynthesis !== 'undefined',

    async requestMicrophone() {
      if (!navigator.mediaDevices?.getUserMedia) return 'unavailable'
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
        return 'granted'
      } catch (error) {
        return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'denied' : 'unavailable'
      }
    },

    listen(lang, handlers) {
      const Ctor = recognitionCtor()
      if (!Ctor) {
        handlers.onError('unsupported')
        handlers.onEnd()
        return () => {}
      }
      const recognition = new Ctor()
      recognition.lang = lang
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      let finalText = ''
      let failed = false
      recognition.onstart = () => handlers.onStart()
      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) finalText += `${result[0].transcript} `
          else interim += result[0].transcript
        }
        handlers.onInterim(`${finalText}${interim}`.trim())
      }
      recognition.onerror = (event) => {
        failed = true
        handlers.onError(ERRORS[event.error] ?? 'other')
      }
      recognition.onend = () => {
        const text = finalText.trim()
        if (!failed && text) handlers.onFinal(text)
        else if (!failed) handlers.onError('no-speech')
        handlers.onEnd()
      }
      recognition.start()
      return () => recognition.stop()
    },

    speak(text, lang, handlers) {
      const synth = window.speechSynthesis
      synth.cancel()
      const token = ++speechToken
      const parts = sentences(text)
      const voice = pickVoice(lang)
      let started = false
      // Some browsers never fire events when no voice can play; do not leave the UI "speaking" forever.
      const watchdog = window.setTimeout(() => {
        if (!started && token === speechToken) handlers.onEnd()
      }, 4000)

      const speakPart = (index: number) => {
        if (token !== speechToken) return
        if (index >= parts.length) {
          window.clearTimeout(watchdog)
          handlers.onEnd()
          return
        }
        const utterance = new SpeechSynthesisUtterance(parts[index])
        utterance.lang = voice?.lang ?? lang
        if (voice) utterance.voice = voice
        utterance.rate = 1
        utterance.onstart = () => {
          if (!started) {
            started = true
            handlers.onStart()
          }
        }
        utterance.onend = () => speakPart(index + 1)
        utterance.onerror = () => speakPart(index + 1)
        synth.speak(utterance)
      }
      speakPart(0)
    },

    cancelSpeech() {
      speechToken++
      if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel()
    },
  }
}
