import { tmpdir } from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4100)
// The tests add tracker entries and memory notes, so each run saves them to its own throwaway folder.
const RUNTIME_DIR = path.join(tmpdir(), `mini-ai-e2e-${Date.now()}`)

/** Runs against the production build served by the Express server (`npm run test:e2e` builds first). */
export default defineConfig({
  testDir: 'tests/e2e',
  // Generous per-test limit: the assistant tests stream several model rounds and run slowly on a busy machine.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Node directly (not `npm start`): on Windows an npm wrapper can leave the server running after the tests.
    command: 'node server/src/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    // Automated tests use the scripted mock model; replies are labelled "[Test model]".
    // Both projects share this server and the assistant tests send many requests, so the AI rate limit is raised.
    env: { PORT: String(PORT), AI_PROVIDER: 'mock', MINI_AI_RUNTIME_DIR: RUNTIME_DIR, AI_RATE_LIMIT: '1000' },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
