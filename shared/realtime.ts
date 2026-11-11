/** Contract between the Realtime voice routes and the browser. Never contains the permanent API key. */
import type { EvidenceCard, TrackerCard } from './ai.ts'

/** auto: answer in the language the seller speaks. The others fix the reply language. */
export type VoiceLanguage = 'auto' | 'en' | 'hi' | 'hinglish'

export const VOICE_LANGUAGES: VoiceLanguage[] = ['auto', 'en', 'hi', 'hinglish']

/** Common Hindi words written in Latin letters, used to recognise Hinglish. */
const HINDI_WORDS = /\b(hai|hain|hoon|kyun|kyon|kyu|mera|mere|meri|kya|kaise|kaisa|batao|bataiye|samjhao|samjhaiye|mein|ka|ki|ke|aur|nahi|nahin|kitna|kitni|kitne|gaya|gayi|raha|rahe|rahi|chahiye|abhi|thoda|kaun|kab|karo|kariye|karna|ho|hua|hui|aap|aapka|aapke|bhi|toh|wala|wale)\b/gi

/**
 * The language of one seller turn, from its transcript. Auto mode uses it to keep replies in the seller's language
 * (in live tests the model otherwise drifted to English after English tool results). Very short turns ("okay",
 * "haan") return null so a filler word never switches the language.
 */
export function detectSpokenLanguage(text: string): Exclude<VoiceLanguage, 'auto'> | null {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length < 3) return null
  const devanagari = (text.match(/[ऀ-ॿ]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  if (devanagari > latin) return 'hi'
  const hindiWords = (text.match(HINDI_WORDS) ?? []).length
  if (hindiWords >= 2 || (devanagari > 0 && latin > 0)) return 'hinglish'
  return 'en'
}

export interface RealtimeHealth {
  /** True when live voice can start. False shows the reason and keeps the chat and browser voice. */
  available: boolean
  /** "openai" for the real API; "mock" only in automated tests. */
  provider: 'openai' | 'mock'
  model: string | null
  voice: string | null
  reason: string | null
}

export interface RealtimeSessionResponse {
  voiceSessionId: string
  /** Short-lived OpenAI client secret (ek_…), valid only to open this one connection. */
  clientSecret: string
  /** Unix seconds. */
  expiresAt: number
  model: string
  voice: string
  language: VoiceLanguage
  /** Test mode: the browser must use its injected fake transport, never OpenAI. */
  mock: boolean
}

export interface RealtimeToolRequest {
  voiceSessionId: string
  callId: string
  name: string
  /** JSON string exactly as the model sent it. */
  arguments: string
}

export interface RealtimeToolResponse {
  ok: boolean
  /** What goes back to the model (compact JSON). */
  output: string
  /** Shown beside the conversation while the voice speaks a short summary. */
  evidence: EvidenceCard[]
  tracker: TrackerCard[]
  label: string
  ms: number
  /** True when this call_id was already run; the cached result is returned and nothing runs twice. */
  duplicate: boolean
}

export interface RealtimeTranscriptEntry {
  role: 'seller' | 'assistant'
  text: string
  at: string
  /** Measured in the browser, milliseconds. */
  timing?: Record<string, number>
  /** For assistant turns: cancelled by an interruption. */
  interrupted?: boolean
}
