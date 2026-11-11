import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type Response } from 'express'
import { errorHandler } from './http/respond.ts'
import { sharedKv } from './kv.ts'
import { flushWorkspace, hydrateWorkspace } from './workspace/json-file.ts'
import type { AiService } from './ai/service.ts'
import type { RealtimeConfig } from './realtime/config.ts'
import { createApiRouter } from './routes/index.ts'
import type { MintSecret } from './routes/realtime.ts'

const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url))

export function createApp(options: { ai?: AiService; realtime?: { config?: RealtimeConfig; mint?: MintSecret } } = {}) {
  const app = express()
  app.disable('x-powered-by')
  // Behind a host's proxy (Render, Railway…), TRUST_PROXY=1 makes req.ip the visitor's address, so the AI rate
  // limit applies per visitor instead of to everyone at once. Off by default for local runs.
  const trustProxy = Number(process.env.TRUST_PROXY)
  if (Number.isInteger(trustProxy) && trustProxy > 0) app.set('trust proxy', trustProxy)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-Frame-Options', 'DENY')
    // The voice assistant needs the microphone on this origin only.
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()')
    next()
  })
  app.use(express.json({ limit: '100kb' }))
  // Hosted on serverless functions: load the tracker and memory from shared storage before each request, and hold
  // the response until this request's changes are saved (see kv.ts). Does nothing locally.
  app.use('/api', async (_req, res, next) => {
    if (!sharedKv()) return next()
    try {
      await hydrateWorkspace()
    } catch (error) {
      return next(error)
    }
    const end = res.end.bind(res) as (...args: unknown[]) => Response
    ;(res as unknown as { end: (...args: unknown[]) => Response }).end = (...args: unknown[]) => {
      void flushWorkspace().finally(() => end(...args))
      return res
    }
    next()
  })
  app.use('/api', createApiRouter(options.ai, options.realtime))
  app.use('/api', errorHandler)

  // In production the API also serves the built client, so one process runs the whole app.
  if (existsSync(CLIENT_DIST)) {
    app.use(
      '/assets',
      express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
    )
    app.use(express.static(CLIENT_DIST, { index: false }))
    app.use((request, response, next) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') return next()
      response.sendFile(path.join(CLIENT_DIST, 'index.html'))
    })
  }

  return app
}
