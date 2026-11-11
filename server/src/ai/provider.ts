/** Provider-neutral model interface. KAM prompts, tools, sessions and voice never import a vendor SDK. */
import type { ResponseInputItem } from 'openai/resources/responses/responses'

export type InputItem = ResponseInputItem

export interface FunctionCall {
  callId: string
  name: string
  arguments: string
}

export interface ModelRequest {
  instructions: string
  input: InputItem[]
  tools: Array<{ type: 'function'; name: string; description: string; parameters: Record<string, unknown>; strict: boolean }>
  /** "none" forces a final answer (used when the tool-round limit is reached). */
  toolChoice: 'auto' | 'none'
  /** JSON schema the final message must follow. */
  format: { type: 'json_schema'; name: string; schema: Record<string, unknown>; strict: true }
  signal: AbortSignal
}

export interface ModelResult {
  /** Output items, ready to append to the next request's input. */
  items: InputItem[]
  text: string | null
  functionCalls: FunctionCall[]
  model: string
}

export interface ModelProvider {
  readonly name: 'openai' | 'mock'
  /** Resolves (and caches) the model ID; null when it cannot be determined. */
  resolveModel(): Promise<string | null>
  generate(request: ModelRequest): Promise<ModelResult>
}

export class ProviderError extends Error {
  code: 'not_configured' | 'llm_error' | 'timeout'

  constructor(code: ProviderError['code'], message: string) {
    super(message)
    this.code = code
  }
}
