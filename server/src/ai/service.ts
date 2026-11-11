import type { AiHealth } from '../../../shared/ai.ts'
import { getStore, type Store } from '../data/store.ts'
import { readAiConfig, type AiConfig } from './config.ts'
import { MockProvider } from './mock-provider.ts'
import { OpenAiProvider } from './openai-provider.ts'
import { ProviderError, type ModelProvider } from './provider.ts'
import { SessionStore } from './sessions.ts'
import { buildTools, type ToolSpec } from './tools.ts'

export interface AiService {
  config: AiConfig
  provider: ModelProvider | null
  tools: ToolSpec[]
  sessions: SessionStore
  store: Store
  health(): Promise<AiHealth>
}

export function createAiService(config: AiConfig = readAiConfig(), store: Store = getStore()): AiService {
  const provider: ModelProvider | null =
    config.provider === 'mock' ? new MockProvider() : config.apiKey ? new OpenAiProvider(config) : null

  return {
    config,
    provider,
    tools: buildTools(store),
    sessions: new SessionStore(),
    store,
    async health() {
      const issues = [...config.issues]
      let model: string | null = null
      if (provider) {
        try {
          model = await provider.resolveModel()
          if (!model) issues.push('No suitable chat model is available for this key. Set OPENAI_MODEL.')
        } catch (error) {
          issues.push(error instanceof ProviderError ? error.message : 'Could not check the model.')
        }
      }
      return {
        provider: config.provider,
        configured: Boolean(provider && model),
        model,
        modelSource: config.provider === 'mock' ? 'mock' : config.model ? 'env' : model ? 'auto' : null,
        maxToolRounds: config.maxToolRounds,
        issues,
      }
    },
  }
}
