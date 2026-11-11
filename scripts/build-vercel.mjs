// Builds the Vercel deployment in .vercel/output (Vercel Build Output API v3), then deploy it with
//   vercel deploy --prebuilt --prod
//
//   static/                 the built client, served from Vercel's CDN (instant page loads, long-cached assets)
//   functions/api.func/     the Express API as one Node function in Mumbai, bundled with rolldown, with the demo
//                           data and prompt files beside it
//
// Run `npm run build` first (it builds the client and type-checks the server).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'

const root = new URL('../', import.meta.url)
const path = (rel) => fileURLToPath(new URL(rel, root))
const out = '.vercel/output/'
const fn = `${out}functions/api.func/`

if (!existsSync(path('client/dist/index.html'))) {
  console.error('client/dist is missing: run npm run build first.')
  process.exit(1)
}
rmSync(path(out), { recursive: true, force: true })

// 1. The client.
mkdirSync(path(`${out}static`), { recursive: true })
cpSync(path('client/dist'), path(`${out}static`), { recursive: true })

// 2. The API. The bundle sits two folders below server/ like the source files it came from, so their paths to
//    server/data and server/prompts (new URL('../../data/', import.meta.url)) resolve the same way.
const handler = 'server/src/vercel/index.mjs'
await build({
  input: path('server/src/vercel.ts'),
  platform: 'node',
  logLevel: 'warn',
  output: {
    file: path(fn + handler),
    format: 'esm',
    // Express and its dependencies are CommonJS and call require() for Node built-ins.
    banner: "import { createRequire as __miniAiCreateRequire } from 'node:module'; const require = __miniAiCreateRequire(import.meta.url);",
  },
})
cpSync(path('server/data'), path(`${fn}server/data`), { recursive: true })
cpSync(path('server/prompts'), path(`${fn}server/prompts`), { recursive: true })
writeFileSync(
  path(`${fn}.vc-config.json`),
  JSON.stringify(
    {
      runtime: 'nodejs24.x',
      handler,
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 120,
      regions: ['bom1'],
    },
    null,
    2,
  ),
)

// 3. Routing: API to the function, files from the CDN, every other path to the app (client-side routes).
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  // The voice assistant needs the microphone on this origin only.
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
}
writeFileSync(
  path(`${out}config.json`),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '/(.*)', headers: securityHeaders, continue: true },
        { src: '/api/(.*)', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
)

const kb = (rel) => Math.round(statSync(path(rel)).size / 1024)
const bundle = readFileSync(path(fn + handler), 'utf8')
console.log(`Built ${out}: client ${kb('client/dist/index.html')} KB index + assets, API bundle ${kb(fn + handler)} KB`)
if (/sk-[A-Za-z0-9_-]{20,}/.test(bundle)) {
  console.error('The API bundle contains something that looks like an OpenAI key. Not deploying.')
  process.exit(1)
}
