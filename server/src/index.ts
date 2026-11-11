import { existsSync } from 'node:fs'
import { createApp } from './app.ts'
import { getStore } from './data/store.ts'
import { contextFor } from './insights/context.ts'
import { investigateOverview } from './investigations/index.ts'

// Secrets live in server/.env (never committed). Variables already set in the environment win.
const envFile = new URL('../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const port = Number.parseInt(process.env.PORT ?? '4000', 10)

// Compute the analytics and investigations once before accepting requests (about 0.2 s), so the first visitor
// after a restart does not wait for them.
investigateOverview(contextFor(getStore()))

const server = createApp().listen(port, () => {
  console.log(`Mini AI API listening on http://localhost:${port}`)
})

server.on('error', (error) => {
  console.error(`Mini AI API could not start: ${error.message}`)
  process.exitCode = 1
})
