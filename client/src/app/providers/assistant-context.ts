import type { AssistantReply } from '@shared/ai.ts'
import { createContext, use } from 'react'
import type { AssistantView } from '@/types'

export type VoiceState =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'processing'
  | 'investigating'
  | 'waiting'
  | 'speaking'
  | 'interrupted'
  | 'error'

export type ConnectionState = 'idle' | 'connecting' | 'ready' | 'not_configured' | 'error'
export type RecognitionLanguage = 'en-IN' | 'hi-IN'

export interface ConversationMessage {
  id: string
  author: 'seller' | 'assistant' | 'system'
  text: string
  createdAt: number
  via?: 'voice' | 'text'
  reply?: AssistantReply
  tone?: 'info' | 'error'
}

/** A data check that really ran (or is running) for the current answer. */
export interface CheckProgress {
  callId: string
  label: string
  status: 'running' | 'done' | 'failed'
}

export interface VoiceStatus {
  state: VoiceState
  interim: string
  error: string | null
  recognitionSupported: boolean
  synthesisSupported: boolean
  muted: boolean
  language: RecognitionLanguage
}

export interface AssistantContextValue {
  view: AssistantView
  messages: readonly ConversationMessage[]
  draft: string
  setDraft: (value: string) => void
  /** Opens the panel (starting a conversation if needed). A prefill replaces the draft. */
  openAssistant: (prefill?: string) => void
  /** Hides the panel; the conversation continues. */
  minimiseAssistant: () => void
  /** Ends the conversation and closes the panel. */
  closeAssistant: () => void
  sendMessage: (text: string, via?: 'voice' | 'text', recognitionMs?: number | null) => void
  connection: ConnectionState
  connectionMessage: string | null
  retryConnection: () => void
  busy: boolean
  checks: readonly CheckProgress[]
  voice: VoiceStatus
  startListening: () => void
  stopListening: () => void
  interruptSpeech: () => void
  toggleMute: () => void
  setVoiceLanguage: (language: RecognitionLanguage) => void
}

export const AssistantContext = createContext<AssistantContextValue | null>(null)

export function useAssistant(): AssistantContextValue {
  const context = use(AssistantContext)
  if (!context) throw new Error('useAssistant must be used inside <AssistantProvider>')
  return context
}
