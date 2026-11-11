import { Router } from 'express'
import type { ApiError } from '../../../shared/api.ts'
import { createAiService, type AiService } from '../ai/service.ts'
import { createAiRouter } from './ai.ts'
import { analyticsRouter } from './analytics.ts'
import { healthRouter } from './health.ts'
import { actionsRouter, investigationsRouter, qualityRouter } from './insights.ts'
import { recordsRouter } from './records.ts'
import { sellerRouter } from './seller.ts'
import { decisionsRouter, memoryRouter, reviewRouter, trackerRouter } from './workspace.ts'
import { readRealtimeConfig, type RealtimeConfig } from '../realtime/config.ts'
import { createRealtimeRouter, type MintSecret } from './realtime.ts'

/** Everything under /api. Demo data is read-only; the tracker and seller memory are saved in server/runtime. */
export function createApiRouter(ai: AiService = createAiService(), realtime: { config?: RealtimeConfig; mint?: MintSecret } = {}) {
  const apiRouter = Router()

  apiRouter.use('/health', healthRouter)
  apiRouter.use('/ai', createAiRouter(ai))
  apiRouter.use('/realtime', createRealtimeRouter({ config: realtime.config ?? readRealtimeConfig(), store: ai.store, allTools: ai.tools, mint: realtime.mint }))
  apiRouter.use('/seller', sellerRouter)
  apiRouter.use('/analytics', analyticsRouter)
  apiRouter.use('/investigations', investigationsRouter)
  apiRouter.use('/actions/recommendations', decisionsRouter)
  apiRouter.use('/actions', actionsRouter)
  apiRouter.use('/tracker', trackerRouter)
  apiRouter.use('/memory', memoryRouter)
  apiRouter.use('/review', reviewRouter)
  apiRouter.use('/data-quality', qualityRouter)
  apiRouter.use('/', recordsRouter)

  apiRouter.use((_request, response) => {
    response.status(404).json({ error: { code: 'not_found', message: 'Not found' } } satisfies ApiError)
  })
  return apiRouter
}
