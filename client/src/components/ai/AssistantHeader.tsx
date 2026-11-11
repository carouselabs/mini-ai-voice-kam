import { AudioLines, Minus, Volume2, VolumeX, X } from 'lucide-react'
import { useAssistant, type VoiceState } from '@/app/providers/assistant-context'
import { BrandOrb } from '@/components/brand/OrbitGlyph'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'

const VOICE_LABEL: Record<VoiceState, string> = {
  idle: 'Ready',
  requesting: 'Waiting for microphone',
  listening: 'Listening',
  processing: 'Got it',
  investigating: 'Investigating your data',
  waiting: 'Thinking',
  speaking: 'Speaking',
  interrupted: 'Stopped',
  error: 'Voice problem',
}

export function AssistantHeader({
  titleId,
  onMinimise,
  onClose,
  live = false,
  liveAvailable = false,
  liveReason = null,
  onLive,
}: {
  titleId: string
  onMinimise: () => void
  onClose: () => void
  live?: boolean
  liveAvailable?: boolean
  liveReason?: string | null
  onLive?: () => void
}) {
  const { connection, voice, messages, toggleMute } = useAssistant()
  const testModel = messages.some((m) => m.reply?.mock)
  const status =
    connection === 'connecting'
      ? 'Checking your account'
      : connection === 'not_configured'
        ? 'Not configured'
        : connection === 'error'
          ? 'Not connected'
          : VOICE_LABEL[voice.state]
  const working = ['listening', 'investigating', 'speaking', 'waiting', 'processing'].includes(voice.state) || connection === 'connecting'

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-linear-to-b from-brand-50/70 to-surface py-3 pl-4 pr-2.5">
      <BrandOrb />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 id={titleId} className="text-sm font-semibold text-fg">
            Mini AI
          </h2>
          {testModel && <Badge tone="warning">Test model</Badge>}
        </div>
        <p data-testid="assistant-status" className="flex items-center gap-1.5 truncate text-2xs text-fg-muted">
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              connection === 'not_configured' || connection === 'error' || voice.state === 'error' ? 'bg-negative-mark' : working || live ? 'animate-pulse bg-brand-500 motion-reduce:animate-none' : 'bg-positive-mark',
            )}
          />
          {live ? 'Live voice' : status}
        </p>
      </div>
      {!live && onLive && (
        <Button
          size="sm"
          variant={liveAvailable ? 'primary' : 'secondary'}
          icon={AudioLines}
          disabled={!liveAvailable}
          title={liveAvailable ? 'Talk naturally with Mini AI (OpenAI realtime voice)' : (liveReason ?? 'Live voice is not available')}
          onClick={onLive}
          data-testid="live-voice-button"
        >
          Live
        </Button>
      )}
      {!live && voice.synthesisSupported && (
        <IconButton
          icon={voice.muted ? VolumeX : Volume2}
          label={voice.muted ? 'Turn on spoken replies' : 'Mute spoken replies'}
          aria-pressed={voice.muted}
          size="sm"
          onClick={toggleMute}
        />
      )}
      <IconButton icon={Minus} label="Minimise assistant" size="sm" onClick={onMinimise} />
      <IconButton icon={X} label="End conversation" size="sm" onClick={onClose} />
    </div>
  )
}
