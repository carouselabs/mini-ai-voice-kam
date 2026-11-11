// Checks a running production build the way a deployment would be checked:
//   node scripts/verify-production.mjs http://localhost:4000
// Health, AI configuration, security headers, page routes, no secrets in responses or the bundle, API errors.
// It does not write to the tracker unless --write is given (then it adds and leaves one test action).
const BASE = process.argv[2] ?? 'http://localhost:4000'
const write = process.argv.includes('--write')
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const get = (path, init) => fetch(BASE + path, init)
const health = await get('/api/health')
check('GET /api/health is 200', health.ok, `${health.status}`)
const ai = await (await get('/api/ai/health')).json()
check('AI is configured on the server', ai.configured === true, `${ai.provider} ${ai.model ?? ''}`)
const aiText = JSON.stringify(ai)
check('AI health never contains a key', !/sk-[A-Za-z0-9]/.test(aiText) && !/apiKey/i.test(aiText))

const page = await get('/actions')
const html = await page.text()
check('A dashboard route serves the app (SPA fallback)', page.ok && html.includes('<div id="root">'), `${page.status}`)
check('Microphone allowed for this origin only', page.headers.get('permissions-policy')?.includes('microphone=(self)') ?? false, page.headers.get('permissions-policy') ?? 'missing')
check('nosniff header', page.headers.get('x-content-type-options') === 'nosniff')
check('No X-Powered-By header', !page.headers.get('x-powered-by'))

const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
let bundle = ''
for (const s of scripts) bundle += await (await get(s)).text()
check('Client bundle downloaded', bundle.length > 1000, `${scripts.length} script(s), ${Math.round(bundle.length / 1024)} KB`)
check('No OpenAI key or key name in the client bundle', !/sk-[A-Za-z0-9_-]{16,}/.test(bundle) && !bundle.includes('OPENAI_API_KEY'))

const bad = await get('/api/orders?period=yesterday')
const badBody = await bad.json()
check('Bad input gives a clear 400', bad.status === 400 && typeof badBody.error?.message === 'string', badBody.error?.message)
const missing = await get('/api/nothing-here')
check('Unknown API path gives 404 JSON', missing.status === 404)

const tracker = await (await get('/api/tracker')).json()
check('Tracker endpoint works', Array.isArray(tracker.data?.actions), `${tracker.data?.actions?.length} actions`)
if (write) {
  const created = await get('/api/tracker', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `Production check ${new Date().toISOString()}`, approve: true }),
  })
  check('Tracker accepts a new action', created.status === 201)
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`)
process.exitCode = failed ? 1 : 0
