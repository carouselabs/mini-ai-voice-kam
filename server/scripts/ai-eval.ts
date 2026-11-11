/**
 * Business-scenario evaluation for the Virtual KAM (Milestone 3, phase 10).
 *
 *   npm run ai:eval -w @mini-ai/server            # live model (needs OPENAI_API_KEY in server/.env)
 *   npm run ai:eval -w @mini-ai/server -- --mock  # scripted test model (plumbing check only)
 *
 * Writes transcripts to server/eval-results/. A --mock run is labelled MOCK and is never evidence
 * that the live LLM works.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AssistantReply } from '../../shared/ai.ts'
import { readAiConfig } from '../src/ai/config.ts'
import { openSession, runTurn } from '../src/ai/engine.ts'
import type { InputItem } from '../src/ai/provider.ts'
import { createAiService } from '../src/ai/service.ts'
import { getWorkspace } from '../src/workspace/index.ts'

const envFile = new URL('../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)
// The tracker and memory scenarios write; they start from an empty workspace of their own.
process.env.MINI_AI_RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), 'mini-ai-eval-'))

/** A turn that closes the conversation and opens a new one, as when the seller comes back later. */
const NEW_SESSION = '[seller opens the assistant again later]'

const mock = process.argv.includes('--mock')
const config = readAiConfig(mock ? { ...process.env, AI_PROVIDER: 'mock' } : process.env)
const ai = createAiService(config)
if (!ai.provider) {
  console.error(`Not configured: ${config.issues.join(' ')}`)
  process.exit(1)
}

type Check = { name: string; test: (replies: AssistantReply[], tools: string[][]) => boolean }

const has = (pattern: RegExp) => (replies: AssistantReply[]) => replies.some((r) => pattern.test(r.text))
const lacks = (pattern: RegExp) => (replies: AssistantReply[]) => replies.every((r) => !pattern.test(r.text))
/** Applied to every scenario: replies are spoken, so internal IDs must never be in them. */
const NO_INTERNAL_IDS: Check = { name: 'no action or finding IDs read aloud', test: lacks(/\b(ACT|FIND)-[A-Z0-9]/) }
/**
 * Applied to every scenario (Milestone 5): the two overclaims found in Milestone 4, checked on what the seller hears.
 * Deliberately independent of the server's own claim check (src/ai/claims.ts), so a blind spot there cannot hide a failure here.
 */
const sentencesOf = (r: AssistantReply) => r.text.split(/(?<=[.!?।])\s+/)
const NO_STOCKOUT_OVERCLAIM: Check = {
  name: 'never calls stockouts the main/clearest driver',
  test: (replies) =>
    replies.every((r) =>
      sentencesOf(r).every((s) => !(/stock/i.test(s) && /\b(clearest|biggest|main|primary|major|largest|key)\s+(drivers?|causes?|reasons?)\b/i.test(s) && !/\bnot\s+(a\s+|the\s+)?(proven|main|clearest|biggest)/i.test(s))),
    ),
}
const NO_SELLER_RATE: Check = {
  name: 'never calls the overall cancellation rate seller-side',
  test: (replies) =>
    replies.every((r) => sentencesOf(r).every((s) => !(/seller[-\s]?(side|initiated)?\s+cancell?ations?/i.test(s) && /\b14(\.\d)?\s?(%|percent)/i.test(s) && !/overall/i.test(s)))),
}
const UNIVERSAL = [NO_INTERNAL_IDS, NO_STOCKOUT_OVERCLAIM, NO_SELLER_RATE]
const usedTool = (...names: string[]) => (_: AssistantReply[], tools: string[][]) => names.some((n) => tools.flat().includes(n))
const words = (r: AssistantReply) => r.text.trim().split(/\s+/).length
const maxWords = (n: number): Check => ({ name: `every reply ≤ ${n} words (spoken length)`, test: (r) => r.every((x) => words(x) <= n) })

const SCENARIOS: Array<{ id: string; title: string; turns: string[]; checks: Check[] }> = [
  {
    id: '01-sales-decline', title: 'Sales decline', turns: ['My sales have dropped. Can you tell me what’s happening?'],
    checks: [
      { name: 'investigates before answering', test: usedTool('investigateSalesDecline', 'getSalesAnalysis', 'investigateAccountHealth') },
      { name: 'states the 32.5% / ₹65,000 decline', test: has(/32\.5|65,000|65000/) },
      { name: 'notes price is unchanged', test: has(/₹?500|price/i) },
      { name: 'hedges stockouts as a likely cause, not proven', test: (r) => !/stock/i.test(r[0].text) || /likely|looks like|seems|might|could|contribut/i.test(r[0].text) },
      // Milestone 5, problem A
      { name: 'says order volume fell while the average price did not', test: (r) => /400|270|fewer orders|order volume|orders (fell|dropped|declined)/i.test(r[0].text) && /₹?500|same (average )?price|price (stayed|was unchanged|did not|didn(’|')?t)|unchanged/i.test(r[0].text) },
      { name: 'states out-of-stock variants rose from 5 to 18', test: (r) => /\b5\b[^.]{0,40}\b18\b/.test(r[0].text) },
      { name: 'says what would establish the stockout share', test: (r) => /demand|availability|lost[- ]orders?|not (yet )?(proven|measured|confirmed)|can(’|')?t (yet )?(prove|measure|confirm)|isn(’|')?t (yet )?(proven|measured)/i.test(r[0].text) },
      maxWords(100),
    ],
  },
  {
    id: '02-inventory-dispute', title: 'Seller disputes inventory', turns: ['My sales have dropped. Can you tell me what’s happening?', 'I don’t think inventory is the issue. I have stock.'],
    checks: [
      { name: 'acknowledges the seller', test: (r) => /understand|got it|fair|okay|thanks|noted|appreciate/i.test(r.at(-1)?.text ?? '') },
      { name: 'looks up stock records on the correction turn', test: (_, t) => t.at(-1)!.some((n) => /Inventory|ProductPerformance|searchProducts/.test(n)) },
      { name: 'names what the system shows (sizes, colours or SKUs)', test: (r) => /size|colour|color|SKU|variant|\b(M|L|XL)\b/i.test(r.at(-1)?.text ?? '') },
      maxWords(100),
    ],
  },
  {
    id: '03-quality-is-good', title: 'Seller says quality is good', turns: ['Why are my returns going up?', 'The product quality is good. I don’t think customers have a quality problem.'],
    checks: [
      { name: 'moves to other explanations', test: (r) => /size|colour|color|delivery|damage|description|expectation|dispatch/i.test(r.at(-1)?.text ?? '') },
      maxWords(100),
    ],
  },
  {
    id: '04-unnecessary-cancellations', title: 'Customers cancelling unnecessarily', turns: ['Customers are cancelling unnecessarily.'],
    checks: [
      { name: 'inspects cancellations', test: usedTool('investigateCancellationSpike', 'getCancellationAnalysis') },
      { name: 'does not simply agree: cites seller-side reasons', test: has(/stock|inventory|dispatch|delay|seller|fulfil/i) },
      { name: 'no accusation', test: lacks(/fraud|blacklist|block (the|these) customer/i) },
      // Milestone 5, problem B
      { name: 'separates customer-initiated from seller-initiated cancellations', test: has(/customer[- ]initiated|seller[- ]initiated|customers? (cancelled|cancellations?) (fell|dropped|went down)|from customers|by customers/i) },
      { name: 'calls the 8% → 14% figure the overall rate', test: (r) => r.every((x) => !/\b14\s?(%|percent)/i.test(x.text) || /overall|all cancellations|total cancellation/i.test(x.text)) },
    ],
  },
  {
    id: '05-repeat-returns', title: 'Repeated return patterns', turns: ['I think some customers are ordering and returning products repeatedly.'],
    checks: [
      { name: 'checks customer patterns', test: usedTool('getCustomerBehaviourPatterns', 'investigateReturnSpike') },
      { name: 'recommends human review, not action against customers', test: (r) => /review/i.test(r.map((x) => x.text).join(' ')) && lacks(/blacklist|deny (the )?refund|refuse (the )?refund|fraudster/i)(r) },
      { name: 'does not tie the repeat customers to unrelated products', test: lacks(/earbud|lamp|kurta/i) },
      maxWords(100),
    ],
  },
  {
    id: '06-product', title: 'Product-specific question', turns: ['Why is the Bluetooth speaker not selling?'],
    checks: [
      { name: 'looks the product up', test: usedTool('searchProducts', 'getProductPerformance') },
      { name: 'mentions price or conversion', test: has(/price|₹1,399|1399|convert|conversion|reference/i) },
    ],
  },
  {
    id: '07-what-to-do', title: 'Asks for recommendations', turns: ['Tell me exactly what I should do now.'],
    checks: [
      { name: 'uses data', test: (_, t) => t.flat().length > 0 },
      { name: 'no promised revenue', test: lacks(/guarantee|will (definitely )?(increase|recover) (your )?(sales|revenue) by/i) },
      { name: 'quality check before reordering earbuds', test: (r) => !/earbud/i.test(r[0].text) || /quality|defect|inspect/i.test(r[0].text) },
      { name: 'says what to monitor', test: has(/monitor|watch|track|keep an eye/i) },
      maxWords(150),
    ],
  },
  {
    id: '08-unavailable', title: 'Asks for unavailable information', turns: ['Did my supplier confirm the delivery date today?'],
    checks: [
      { name: 'says it cannot see it', test: has(/can(’|')?t see|cannot see|don(’|')?t have|not (in|available)|no record|isn(’|')?t in/i) },
      { name: 'invents no confirmation', test: lacks(/^yes\b|\b(has|have|did) confirmed?\b|supplier confirmed (it|that|the delivery|on|for)/i) },
    ],
  },
  {
    id: '09-natural', title: 'Short follow-ups and a topic change', turns: ['sales?', 'and stock?', 'actually forget that, what about pricing?'],
    checks: [
      { name: 'answers the topic change', test: (r) => /price|pricing|margin|reference/i.test(r.at(-1)?.text ?? '') },
      { name: 'stays short', test: (r) => r.every((x) => x.text.split(/\s+/).length < 190) },
    ],
  },
  {
    id: '10-language', title: 'Hindi and Hinglish', turns: ['मेरी बिक्री कम क्यों हो गई है?', 'Mere cancellations kyun badh rahe hain?'],
    checks: [
      { name: 'replies in Hindi to Hindi', test: (r) => r[0]?.language === 'hi' || /[ऀ-ॿ]/.test(r[0]?.text ?? '') },
      { name: 'replies in Hinglish/Hindi to Hinglish', test: (r) => r[1]?.language !== 'en' || /hai|aap|kyun|ke/i.test(r[1]?.text ?? '') },
      { name: 'Hindi counts read the right way round', test: lacks(/17 में से 20/) },
      // Milestone 5: a live answer said "20 में से 18 variants"; 18 is out of 43 SKUs, 20 is the product count.
      { name: 'out-of-stock count uses the right total (SKUs, not products)', test: lacks(/20 में से 18|18 (of|out of) (the |your )?20\b/i) },
      maxWords(100),
    ],
  },
  {
    id: '11-tracker-approval', title: 'Adds an action to the tracker only when asked, for the seller to approve',
    turns: ['What should I fix first?', 'Okay, add the restock action to my tracker.'],
    checks: [
      { name: 'does not add anything before being asked', test: (_, t) => !t[0].includes('proposeTrackerAction') },
      { name: 'first answer shows recommendation cards', test: (r) => r[0].actions.length > 0 },
      { name: 'adds it when asked', test: (_, t) => t[1].includes('proposeTrackerAction') },
      { name: 'the entry is Awaiting Approval, created by Mini AI', test: () => getWorkspace().tracker.list().some((a) => a.createdBy === 'mini-ai' && a.status === 'Awaiting Approval' && a.approvedAt === null) },
      { name: 'reply shows an approval card', test: (r) => r[1].tracker.length === 1 && r[1].tracker[0].status === 'Awaiting Approval' },
      { name: 'asks the seller to approve', test: (r) => /approv/i.test(r[1].text) },
      { name: 'never claims it is approved or done', test: lacks(/\b(is|has been|now) (approved|in progress|done|completed)\b|I('ve| have) approved/i) },
      maxWords(100),
    ],
  },
  {
    id: '12-memory', title: 'Remembers what the seller said, and uses it next time as their statement',
    turns: [
      'Why has the Bluetooth speaker stopped selling?',
      'The brand raised the speaker price in October. I can’t change it.',
      NEW_SESSION,
      'What should I do about the speaker?',
    ],
    checks: [
      { name: 'saves the seller’s statement', test: (_, t) => t[1].includes('rememberSellerContext') },
      { name: 'saved as unverified seller statement', test: () => getWorkspace().memory.list().some((m) => /price|brand/i.test(m.text) && m.verifiedBySystem === false) },
      { name: 'new session recalls the saved context', test: (_, t) => t[2].includes('getSellerContext') },
      { name: 'attributes it to the seller', test: (r) => /you (mentioned|said|told)|as you said|you’ve said|you've said|since the brand|brand (sets|raised|controls)/i.test(r[3].text) },
      { name: 'does not push a price cut the seller ruled out', test: (r) => !/\b(lower|reduce|cut|drop) (the |its )?price\b/i.test(r[3].text) || /can(’|')?t|cannot|brand/i.test(r[3].text) },
      maxWords(100),
    ],
  },
  {
    id: '13-business-review', title: 'Business review',
    turns: ['Give me a business review.'],
    checks: [
      { name: 'uses the business review', test: usedTool('getBusinessReview') },
      { name: 'covers risks and actions', test: has(/risk|problem|issue/i) },
      { name: 'labels an unproven upside as uncertain', test: has(/might|could|may|hypothes|not (yet )?(proven|confirmed)|test/i) },
      { name: 'says what to monitor', test: has(/monitor|watch|track|keep an eye/i) },
      maxWords(150),
    ],
  },
  {
    id: '14-tracker-status', title: 'Asks what has been committed to',
    turns: ['What actions have I committed to so far?'],
    checks: [
      { name: 'reads the tracker', test: usedTool('getActionTracker', 'getSellerContext') },
      { name: 'reports the entry waiting for approval', test: has(/await|approv|pending/i) },
      { name: 'does not invent progress', test: lacks(/\b(is|are) (in progress|completed|done)\b/i) },
      maxWords(100),
    ],
  },
  {
    // Milestone 5: the greeting is where "seller-side … 14%" and "clearest drivers" first appeared.
    id: '15-greeting', title: 'Opening greeting (the app inspects the account, then greets)', turns: [NEW_SESSION],
    checks: [
      { name: 'states the 32.5% decline', test: has(/32\.5|65,000/) },
      { name: 'if it mentions the 14% rate, calls it overall', test: (r) => !/\b14\s?(%|percent)/i.test(r[0].text) || /overall|all cancellations|total cancellation/i.test(r[0].text) },
      { name: 'hedges any cause it names', test: (r) => !/stock/i.test(r[0].text) || /likely|may|might|could|contribut|possibl|look/i.test(r[0].text) },
      // Added 2026-11-11 from the assignment brief: "Greet the seller and understand the reason for the call."
      { name: 'asks why the seller is calling', test: (r) => /\?\s*$/.test(r[0].text.trim()) },
      maxWords(80),
    ],
  },
  // Added 2026-11-11 from the assignment brief (steps 3 and 6) and the request for plain, simple English.
  {
    id: '16-lead-and-ask',
    title: 'Leads the investigation and asks a sensible follow-up question (brief step 3)',
    turns: ['My sales have dropped significantly this month. I don’t understand why. Can you help me?', 'Okay. What else could it be?'],
    checks: [
      { name: 'checks the data before answering', test: usedTool('investigateSalesDecline', 'investigateAccountHealth', 'getSellerOverview') },
      { name: 'states the decline', test: has(/32\.5|65,000|a third/) },
      { name: 'asks the seller at least one question across the turns', test: has(/\?/) },
      { name: 'at most one question per reply', test: (r) => r.every((x) => (x.text.match(/\?/g) ?? []).length <= 1) },
      { name: 'plain words: no SKU, ASP, conversion, impressions or variance', test: lacks(/\b(SKUs?|ASP|conversion|impressions|variance)\b/i) },
      maxWords(80),
    ],
  },
  {
    id: '17-wrap-up',
    title: 'Recaps the issue, the actions and the next step at the end (brief step 6)',
    turns: ['My sales have dropped this month. Why?', 'What should I do about it?', 'Okay, thanks. That’s all for today.'],
    checks: [
      { name: 'recommends actions', test: (r) => r[1].actions.length >= 2 || /first|second|1\.|two|three/i.test(r[1].text) },
      { name: 'the last reply recaps the issue', test: (r) => /orders|stock|sales/i.test(r[2].text) },
      { name: 'the last reply restates the actions', test: (r) => /first|second|restock|refill|reorder|cancel|tracker/i.test(r[2].text) },
      { name: 'the last reply gives a next step', test: (r) => /next|this week|tracker|approve|check .* again|watch/i.test(r[2].text) },
      { name: 'recap stays short (≤ 130 words)', test: (r) => words(r[2]) <= 130 },
    ],
  },
]

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',')
const repeat = Math.max(1, Math.min(10, Number(process.argv.find((a) => a.startsWith('--repeat='))?.slice(9)) || 1))
const stats = new Map<string, { pass: number; total: number }>()
const outDir = new URL('../eval-results/', import.meta.url)
mkdirSync(outDir, { recursive: true })
const model = await ai.provider.resolveModel()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const lines: string[] = [`# Mini AI scenario evaluation (${mock ? 'MOCK test model, not a live LLM' : `live: ${config.provider} ${model}`})`, `Run ${new Date().toISOString()}`, '']
let failed = 0

for (let run = 1; run <= repeat; run++) {
// Each repetition starts from an empty tracker and memory, so scenarios do not depend on earlier runs.
rmSync(process.env.MINI_AI_RUNTIME_DIR!, { recursive: true, force: true })
for (const scenario of SCENARIOS.filter((s) => !only || only.some((o) => s.id.startsWith(o)))) {
  let session = ai.sessions.create()
  const replies: AssistantReply[] = []
  const tools: string[][] = []
  lines.push(`## ${scenario.id}: ${scenario.title}${repeat > 1 ? ` (run ${run} of ${repeat})` : ''}`, '')
  for (const text of scenario.turns) {
    const used: string[] = []
    const started = Date.now()
    const deps = { provider: ai.provider, tools: ai.tools, store: ai.store, maxToolRounds: config.maxToolRounds }
    const onTool = (e: { status: string; label: string }) => {
      if (e.status === 'start') used.push(ai.tools.find((t) => t.label === e.label)?.name ?? e.label)
    }
    let reply: AssistantReply
    if (text === NEW_SESSION) {
      // Exactly what the app does when the panel opens: inspect the account (and saved context), then greet from the
      // verified figures (no model call since the speed work of 2026-11-11).
      session = ai.sessions.create()
      reply = openSession(deps, session, onTool)
    } else {
      reply = await runTurn(deps, session, [{ role: 'user', content: text } as InputItem], onTool, AbortSignal.timeout(150_000), text)
    }
    replies.push(reply)
    tools.push(used)
    lines.push(
      `**Seller:** ${text}`,
      '',
      `*Tools: ${used.join(', ') || 'none'} · total ${((Date.now() - started) / 1000).toFixed(1)} s (model ${(reply.timing.modelMs / 1000).toFixed(1)} s over ${reply.timing.modelRounds} rounds, tools ${reply.timing.toolMs} ms) · language ${reply.language} · ${reply.text.trim().split(/\s+/).length} words*`,
      '',
      `**Mini AI:** ${reply.text}`,
      '',
    )
    if (reply.evidence.length) lines.push(`*Evidence cited: ${reply.evidence.map((e) => `${e.findingId} (${e.title})`).join('; ')}*`, '')
    // Shown so a reader can tell the model's own wording from a server-corrected one.
    if (reply.claimCheck) lines.push(`*Claim check: draft rewritten for ${reply.claimCheck.revised.join(', ') || 'nothing'}; still flagged after rewrite: ${reply.claimCheck.remaining.join(', ') || 'nothing'}*`, '')
  }
  for (const check of [...scenario.checks, ...UNIVERSAL]) {
    const ok = check.test(replies, tools)
    if (!ok) failed++
    const key = `${scenario.id} · ${check.name}`
    const s = stats.get(key) ?? { pass: 0, total: 0 }
    stats.set(key, { pass: s.pass + (ok ? 1 : 0), total: s.total + 1 })
    lines.push(`- ${ok ? 'PASS' : 'CHECK'}: ${check.name}`)
    console.log(`${ok ? 'PASS ' : 'CHECK'} ${scenario.id} · ${check.name}`)
  }
  lines.push('')
}
}

if (repeat > 1) {
  lines.push(`## Stability over ${repeat} runs`, '', '| Check | Passed |', '|---|---|')
  for (const [key, s] of stats) lines.push(`| ${key} | ${s.pass} / ${s.total} |`)
  lines.push('')
}
const total = [...stats.values()].reduce((n, s) => n + s.total, 0)
lines.push(`**Total: ${total - failed} of ${total} checks passed.**`)
const file = new URL(`${mock ? 'mock' : 'live'}-${stamp}.md`, outDir)
writeFileSync(file, lines.join('\n'))
console.log(`\n${total - failed} of ${total} checks passed${failed ? `; ${failed} need a look` : ''}. Transcript: ${file.pathname}`)
