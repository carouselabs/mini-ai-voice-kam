/**
 * Live voice (OpenAI Realtime) settings. The permanent key is read here and used only by the server to mint
 * short-lived client secrets; it is never sent to the browser.
 */
export interface RealtimeConfig {
  provider: 'openai' | 'mock'
  apiKey: string | null
  model: string
  voice: string
  transcriptionModel: string
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  /**
   * End-of-turn detection. semantic: OpenAI's model judges when the seller has finished a thought (eagerness sets how
   * soon it answers). server: answers after a fixed silence. Chosen by measurement; see docs/REALTIME-VOICE-REPORT.md.
   */
  turnDetection: { type: 'semantic_vad'; eagerness: 'low' | 'medium' | 'high' | 'auto' } | { type: 'server_vad'; silence_duration_ms: number }
  /** How long a minted client secret may be used to open a connection. */
  secretSeconds: number
  issues: string[]
}

function turnDetection(value: string | undefined): RealtimeConfig['turnDetection'] {
  const v = value?.trim() ?? ''
  if (v.startsWith('server')) return { type: 'server_vad', silence_duration_ms: Number(v.split(':')[1]) || 700 }
  const eagerness = v.split(':')[1]
  return { type: 'semantic_vad', eagerness: eagerness === 'low' || eagerness === 'medium' || eagerness === 'auto' ? eagerness : 'high' }
}

/** Voices the Realtime API accepts (OpenAI recommends marin or cedar for quality). */
export const REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const
const EFFORTS = ['minimal', 'low', 'medium', 'high'] as const

export function readRealtimeConfig(env: NodeJS.ProcessEnv = process.env): RealtimeConfig {
  const provider = env.AI_PROVIDER === 'mock' ? 'mock' : 'openai'
  const apiKey = env.OPENAI_API_KEY?.trim() || null
  const voice = env.OPENAI_REALTIME_VOICE?.trim() || 'marin'
  const effort = env.OPENAI_REALTIME_REASONING?.trim() || 'low'
  const issues: string[] = []
  if (provider === 'openai' && !apiKey) issues.push('Set OPENAI_API_KEY in server/.env to turn on live voice.')
  if (!(REALTIME_VOICES as readonly string[]).includes(voice)) issues.push(`OPENAI_REALTIME_VOICE "${voice}" is not a Realtime voice.`)
  return {
    provider,
    apiKey,
    model: env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-2.1',
    voice,
    transcriptionModel: env.OPENAI_REALTIME_TRANSCRIBE_MODEL?.trim() || 'gpt-transcribe',
    reasoningEffort: (EFFORTS as readonly string[]).includes(effort) ? (effort as RealtimeConfig['reasoningEffort']) : 'low',
    // OPENAI_REALTIME_TURN_DETECTION: "semantic:high" (default), "semantic:auto", "server:700" (ms of silence)…
    turnDetection: turnDetection(env.OPENAI_REALTIME_TURN_DETECTION),
    secretSeconds: 120,
    issues,
  }
}
