import OpenAI from 'openai'
import { chooseModel, isReasoningModel, type AiConfig } from './config.ts'
import { ProviderError, type FunctionCall, type InputItem, type ModelProvider, type ModelRequest, type ModelResult } from './provider.ts'

/**
 * OpenAI Responses API with function calling.
 * store: false, so conversations are not kept on OpenAI's side; for reasoning models the
 * encrypted reasoning items are requested and passed back between tool rounds.
 */
export class OpenAiProvider implements ModelProvider {
  readonly name = 'openai' as const
  private client: OpenAI
  private config: AiConfig
  private model: string | null = null
  private resolving: Promise<string | null> | null = null

  constructor(config: AiConfig) {
    if (!config.apiKey) throw new ProviderError('not_configured', 'OPENAI_API_KEY is not set.')
    this.config = config
    this.client = new OpenAI({ apiKey: config.apiKey, timeout: config.requestTimeoutMs, maxRetries: 1 })
  }

  resolveModel(): Promise<string | null> {
    if (this.model) return Promise.resolve(this.model)
    this.resolving ??= (async () => {
      try {
        if (this.config.model) {
          await this.client.models.retrieve(this.config.model)
          this.model = this.config.model
        } else {
          const ids: string[] = []
          for await (const m of this.client.models.list()) ids.push(m.id)
          this.model = chooseModel(ids)
        }
        return this.model
      } catch (error) {
        this.resolving = null
        throw toProviderError(error)
      }
    })()
    return this.resolving
  }

  async generate(request: ModelRequest): Promise<ModelResult> {
    const model = await this.resolveModel()
    if (!model) throw new ProviderError('not_configured', 'No suitable model is available for this API key. Set OPENAI_MODEL.')
    const reasoning = this.config.reasoningEffort ?? (isReasoningModel(model) ? 'low' : null)
    try {
      const response = await this.client.responses.create(
        {
          model,
          instructions: request.instructions,
          input: request.input,
          tools: request.tools,
          tool_choice: request.toolChoice,
          parallel_tool_calls: true,
          store: false,
          max_output_tokens: 2000,
          text: { format: request.format },
          ...(reasoning ? { reasoning: { effort: reasoning }, include: ['reasoning.encrypted_content' as const] } : {}),
        },
        { signal: request.signal },
      )
      const functionCalls: FunctionCall[] = response.output
        .filter((item) => item.type === 'function_call')
        .map((item) => ({ callId: item.call_id, name: item.name, arguments: item.arguments }))
      return {
        items: response.output as unknown as InputItem[],
        text: response.output_text || null,
        functionCalls,
        model: response.model ?? model,
      }
    } catch (error) {
      throw toProviderError(error)
    }
  }
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof OpenAI.APIConnectionTimeoutError || (error instanceof Error && error.name === 'AbortError')) {
    return new ProviderError('timeout', 'The AI took too long to respond.')
  }
  if (error instanceof OpenAI.AuthenticationError) return new ProviderError('not_configured', 'The OpenAI API key was rejected.')
  if (error instanceof OpenAI.NotFoundError) return new ProviderError('not_configured', 'The configured OpenAI model is not available for this key.')
  if (error instanceof OpenAI.RateLimitError) return new ProviderError('llm_error', 'The AI service is busy or out of quota. Try again shortly.')
  if (error instanceof OpenAI.APIError) return new ProviderError('llm_error', `The AI service returned an error (${error.status ?? 'unknown'}).`)
  return new ProviderError('llm_error', 'The AI service could not be reached.')
}
