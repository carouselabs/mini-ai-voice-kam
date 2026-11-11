import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'mini-ai-api',
    mode: 'demo',
    timestamp: new Date().toISOString(),
  })
})
