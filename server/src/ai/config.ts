/**
 * AI configuration from environment variables. The API key stays in this process:
 * it is never returned by any endpoint, logged, or sent to the browser.
 */
export interface AiConfig {
  provider: 'openai' | 'mock'
  apiKey: string | null
  model: string | null
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | null
  maxToolRounds: number
  requestTimeoutMs: number
  issues: string[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const issues: string[] = []
  const rawProvider = (env.AI_PROVIDER ?? 'openai').trim().toLowerCase()
  const provider = rawProvider === 'mock' ? 'mock' : 'openai'
  if (rawProvider !== 'openai' && rawProvider !== 'mock') issues.push(`AI_PROVIDER "${rawProvider}" is not supported; using openai.`)

  const apiKey = env.OPENAI_API_KEY?.trim() || null
  if (provider === 'openai' && !apiKey) {
    issues.push('OPENAI_API_KEY is not set. Add it to server/.env (see server/.env.example) and restart the server.')
  }

  const rounds = Number.parseInt(env.AI_MAX_TOOL_ROUNDS ?? '8', 10)
  const timeout = Number.parseInt(env.AI_REQUEST_TIMEOUT_MS ?? '45000', 10)
  const effort = env.OPENAI_REASONING_EFFORT?.trim().toLowerCase()
  const efforts = ['minimal', 'low', 'medium', 'high'] as const

  return {
    provider,
    apiKey,
    model: env.OPENAI_MODEL?.trim() || null,
    reasoningEffort: efforts.includes(effort as (typeof efforts)[number]) ? (effort as AiConfig['reasoningEffort']) : null,
    maxToolRounds: Number.isFinite(rounds) ? clamp(rounds, 1, 12) : 8,
    requestTimeoutMs: Number.isFinite(timeout) ? clamp(timeout, 5_000, 120_000) : 45_000,
    issues,
  }
}

/** Reasoning models need their reasoning items passed back between tool rounds. */
export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/.test(model)
}

/**
 * Picks a fast tool-calling model from the models this key can use, when OPENAI_MODEL is not set.
 * Prefers the newest "mini" GPT model, then known fallbacks.
 */
export function chooseModel(available: string[]): string | null {
  const minis = available
    .map((id) => ({ id, match: /^gpt-(\d+)(?:\.(\d+))?-mini$/.exec(id) }))
    .filter((m): m is { id: string; match: RegExpExecArray } => m.match !== null)
    .sort((a, b) => Number(b.match[1]) - Number(a.match[1]) || Number(b.match[2] ?? 0) - Number(a.match[2] ?? 0))
  if (minis.length) return minis[0].id
  for (const fallback of ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4o']) {
    if (available.includes(fallback)) return fallback
  }
  return null
}
