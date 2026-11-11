/**
 * The only functions the model can run: the read-only data services plus the seller's
 * workspace (read the tracker, add an entry that awaits approval, note what the seller said).
 * Each has a strict argument schema and a plain-language status label for the UI.
 */
import type { Finding } from '../../../shared/insights.ts'
import type { TrackerAction } from '../../../shared/tracker.ts'
import { getStore, type Store } from '../data/store.ts'
import { ACTION_IDS } from '../insights/recommendations.ts'
import * as kam from '../services/kam-data.ts'
import { compactForModel } from './compact.ts'
import { businessReview, proposeAction, remember, sellerContext, trackerForModel, withStates } from './workspace-tools.ts'

type Args = Record<string, unknown>

export interface ToolSpec {
  name: string
  description: string
  /** JSON schema for the arguments (strict: every property required, nulls for "not given"). */
  parameters: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false }
  /** Shown in the assistant while the tool runs. */
  label: string
  run: (args: Args, store: Store) => unknown
}

const NO_ARGS = { type: 'object', properties: {}, required: [], additionalProperties: false } as const

function productIdArg(store: Store) {
  return {
    type: 'object' as const,
    properties: {
      productId: {
        type: 'string',
        enum: store.products.map((p) => p.productId),
        description: 'Product ID such as PRD-001. Use searchProducts first if you only know the name.',
      },
    },
    required: ['productId'],
    additionalProperties: false as const,
  }
}

/** Built per store so product IDs in the schema always match the data. */
export function buildTools(store: Store = getStore()): ToolSpec[] {
  const simple = (name: string, description: string, label: string, run: (store: Store) => unknown): ToolSpec => ({
    name,
    description,
    parameters: { ...NO_ARGS, properties: {}, required: [] },
    label,
    run: (_args, s) => run(s),
  })
  const byProduct = (name: string, description: string, label: string, run: (id: string, store: Store) => unknown): ToolSpec => ({
    name,
    description,
    parameters: productIdArg(store),
    label,
    run: (args, s) => run(String(args.productId), s),
  })

  return [
    simple('getSellerOverview', 'Headline metrics for both months (sales, orders, average order value, cancellation rate, return rate, out-of-stock SKUs) with sources, plus current alerts, top and declining products and recent orders.', 'Reviewing your account overview', (s) => kam.getSellerOverview(s)),
    simple('getSalesAnalysis', 'Revenue and orders by product, category, week and month, assignment figures vs records, net sales after cancellations and returns.', 'Reviewing sales performance', (s) => kam.getSalesAnalysis(s)),
    {
      name: 'getTopProducts',
      description: 'Best products this month by revenue and by orders.',
      parameters: {
        type: 'object',
        properties: { limit: { type: ['integer', 'null'], description: 'How many products, 1–10. Null for 5.' } },
        required: ['limit'],
        additionalProperties: false,
      },
      label: 'Comparing product performance',
      run: (args, s) => kam.getTopProducts(s, Math.min(10, Math.max(1, Number(args.limit ?? 5)))),
    },
    {
      name: 'searchProducts',
      description: 'Find products by name, SKU, ID or category (e.g. "earbuds", "kurta", "Electronics"). Empty string lists all 20 products.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Words from the product name, SKU, ID or category.' } },
        required: ['query'],
        additionalProperties: false,
      },
      label: 'Looking up the product',
      run: (args, s) => kam.searchProducts(String(args.query ?? ''), s),
    },
    byProduct('getProductPerformance', 'Everything about one product: sales and orders both months, impressions, views, conversion, stock per size/colour, pricing, supplier, reviews, cancellations and returns.', 'Checking the product in detail', (id, s) => kam.getProductPerformance(id, s)),
    simple('getInventoryRisks', 'Out-of-stock and at-risk SKUs with days of cover, supplier lead time, restocks in transit, estimated lost orders and a restock priority list.', 'Checking inventory risks', (s) => kam.getInventoryRisks(s)),
    simple('getCancellationAnalysis', 'Cancellation rate both months, reasons, who initiated, stage (before/after dispatch), rate by waiting time, by product, and repeat customers.', 'Analysing cancellation patterns', (s) => kam.getCancellationAnalysis(s)),
    byProduct('getCancellationReasons', 'Cancellation reasons and records for one product.', 'Reading the product’s cancellations', (id, s) => kam.getCancellationReasonsFor(id, s)),
    simple('getReturnAnalysis', 'Return rate both months, reasons, item condition, refunds, quality complaints and most-returned products.', 'Reviewing return reasons', (s) => kam.getReturnAnalysis(s)),
    byProduct('getReturnReasons', 'Return reasons and records for one product, including seller inspection remarks.', 'Reading the product’s returns', (id, s) => kam.getReturnReasonsFor(id, s)),
    simple('getCustomerBehaviourPatterns', 'Anonymised customers with repeated cancellations, returns or order changes, with the evidence. Patterns are for human review only.', 'Looking for unusual customer patterns', (s) => kam.getCustomerBehaviourPatterns(s)),
    simple('getDeliveryAnalysis', 'Dispatch time, on-time delivery, late deliveries, delivery issues, delivery-related cancellations and whether delays come from seller processing or the courier.', 'Checking delivery performance', (s) => kam.getDeliveryAnalysis(s)),
    simple('getPricingAnalysis', 'Price vs cost and vs synthetic reference prices, pricing position, discounts, margins and price changes.', 'Reviewing pricing', (s) => kam.getPricingAnalysis(s)),
    simple('getCatalogueHealth', 'Listing status, low-rated products and products with no orders.', 'Checking catalogue health', (s) => kam.getCatalogueHealthAnalysis(s)),
    simple('getReviewsAnalysis', 'Recent review sentiment and issues by product (synthetic review text).', 'Reading recent reviews', (s) => kam.getReviewsAnalysis(s)),
    simple('getProfitabilityAnalysis', 'Estimated gross profit and margin by product (before fees, shipping, ads and tax).', 'Estimating profitability', (s) => kam.getProfitabilityAnalysis(s)),
    simple('investigateSalesDecline', 'Full investigation of why sales fell: volume vs price, products, stockouts, visibility, cancellations, returns and pricing, with evidence-backed findings.', 'Investigating the sales decline', (s) => kam.investigateSalesDecline(s)),
    simple('investigateCancellationSpike', 'Full investigation of the cancellation increase: reasons, stages, waiting time, products and customer patterns.', 'Investigating cancellations', (s) => kam.investigateCancellationSpike(s)),
    simple('investigateReturnSpike', 'Full investigation of returns: quality problems, size or colour mismatches, delivery damage and repeated customers.', 'Investigating returns', (s) => kam.investigateReturnSpike(s)),
    simple('investigateInventoryRisk', 'Full investigation of stock: what to restock first, delayed suppliers, SKUs about to run out, oversold orders.', 'Investigating stock and restocking', (s) => kam.investigateInventoryRisk(s)),
    simple('investigateProductVisibility', 'Full investigation of visibility and conversion: high views/low conversion, strong conversion/low visibility, impressions lost while out of stock.', 'Investigating product visibility', (s) => kam.investigateProductVisibility(s)),
    simple('investigatePricing', 'Full investigation of pricing: products priced above the reference, thin margins, price changes.', 'Investigating pricing', (s) => kam.investigatePricing(s)),
    simple('investigateAccountHealth', 'Every investigation at once, most severe findings first: the best starting point for "what should I fix first?".', 'Checking overall account health', (s) => kam.investigateEverything(s)),
    simple('getRecommendedActions', 'Prioritised proposed actions with evidence, owner, suggested date, metric to monitor and where each stands (proposed, awaiting approval, in the tracker). Actions the seller rejected or completed are listed separately; do not propose them again. All are proposals needing the seller’s approval.', 'Preparing recommendations', (s) => withStates(kam.getRecommendedActions(s), s)),
    simple('getBusinessReview', 'A business review: account health (KPIs, delivery, profit), key risks, growth opportunities (each marked supported or hypothesis) and the top three open actions.', 'Preparing your business review', (s) => businessReview(s)),
    simple('getActionTracker', 'The seller’s action tracker: every action with status, owner, due date, overdue flag and latest note, plus progress totals.', 'Checking your action tracker', () => trackerForModel()),
    simple('getSellerContext', 'What the seller told you in earlier conversations (their statements, not verified), recommendations they rejected and why, and open tracker actions.', 'Recalling what you told me', (s) => sellerContext(s)),
    {
      name: 'proposeTrackerAction',
      description: 'Add one recommended action to the seller’s tracker as "Awaiting Approval". Only when the seller has clearly asked to add, track or go ahead with that action. You cannot approve, start or complete it; the seller approves it on screen.',
      parameters: {
        type: 'object',
        properties: {
          recommendationId: { type: 'string', enum: Object.values(ACTION_IDS), description: 'The ACT-… id of the recommended action.' },
          note: { type: ['string', 'null'], description: 'Context from the seller, e.g. their own deadline. Null if none.' },
        },
        required: ['recommendationId', 'note'],
        additionalProperties: false,
      },
      label: 'Adding it to your tracker for approval',
      run: (args, s) => proposeAction(String(args.recommendationId), typeof args.note === 'string' ? args.note : null, s),
    },
    {
      name: 'rememberSellerContext',
      description: 'Save something the seller told you that is not in the data and will matter later: a reason, constraint, decision, preference or open question. Write it as the seller’s statement. Never save your own conclusions or facts from the data.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['seller_statement', 'preference', 'decision', 'open_question'] },
          topic: { type: 'string', description: 'A few words, e.g. "Speaker price" or "Earbuds supplier".' },
          text: { type: 'string', description: 'What the seller said, e.g. "Seller says the brand raised the speaker price in October."' },
          productIds: {
            type: 'array',
            items: { type: 'string', enum: store.products.map((p) => p.productId) },
            description: 'Products it is about; empty if none.',
          },
        },
        required: ['kind', 'topic', 'text', 'productIds'],
        additionalProperties: false,
      },
      label: 'Noting what you told me',
      run: (args) => remember(args),
    },
  ]
}

/** OpenAI Responses API function-tool definitions. */
export function toolDefinitions(tools: ToolSpec[]) {
  return tools.map((t) => ({ type: 'function' as const, name: t.name, description: t.description, parameters: t.parameters, strict: true }))
}

export interface ToolRun {
  name: string
  label: string
  ok: boolean
  /** Compact JSON string returned to the model. */
  output: string
  findings: Finding[]
  /** Tracker entries this call created (always Awaiting Approval). */
  tracker: TrackerAction[]
}

/** Checks arguments against the tool's own schema (providers other than OpenAI strict mode may send anything). */
function validate(spec: ToolSpec, args: unknown): string | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'Arguments must be a JSON object.'
  const given = args as Args
  for (const key of Object.keys(given)) if (!(key in spec.parameters.properties)) return `Unknown argument "${key}".`
  for (const key of spec.parameters.required) {
    if (!(key in given)) return `Missing argument "${key}".`
    const schema = spec.parameters.properties[key] as { type: string | string[]; enum?: string[]; items?: { enum?: string[] } }
    const value = given[key]
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    const stringList = (v: unknown) =>
      Array.isArray(v) && v.length <= 10 && v.every((x) => typeof x === 'string' && (!schema.items?.enum || schema.items.enum.includes(x)))
    const typeOk = types.some((t) =>
      t === 'null'
        ? value === null
        : t === 'integer'
          ? Number.isInteger(value)
          : t === 'string'
            ? typeof value === 'string'
            : t === 'array'
              ? stringList(value)
              : false,
    )
    if (!typeOk) return `Argument "${key}" must be ${types.join(' or ')}.`
    if (schema.enum && !schema.enum.includes(value as string)) return `Argument "${key}" has an unknown value.`
    if (typeof value === 'string' && value.length > 300) return `Argument "${key}" is too long.`
  }
  return null
}

/** Collects Finding objects from any investigation result so the UI can show the real evidence. */
function findingsIn(result: unknown): Finding[] {
  const data = (result as { data?: { findings?: Finding[] } } | null)?.data
  return Array.isArray(data?.findings) ? data.findings : []
}

function trackerIn(result: unknown): TrackerAction[] {
  const proposed = (result as { proposed?: TrackerAction } | null)?.proposed
  return proposed?.id ? [proposed] : []
}

/** Runs one allowlisted tool. Unknown tools, bad JSON, bad arguments and errors come back as error outputs, never exceptions. */
export function executeTool(tools: ToolSpec[], name: string, rawArguments: string, store: Store = getStore()): ToolRun {
  const spec = tools.find((t) => t.name === name)
  if (!spec) {
    return { name, label: 'Unknown check', ok: false, output: JSON.stringify({ error: `Tool "${name}" does not exist.` }), findings: [], tracker: [] }
  }
  let args: unknown
  try {
    args = rawArguments.trim() ? JSON.parse(rawArguments) : {}
  } catch {
    return { name, label: spec.label, ok: false, output: JSON.stringify({ error: 'Arguments were not valid JSON.' }), findings: [], tracker: [] }
  }
  const problem = validate(spec, args)
  if (problem) return { name, label: spec.label, ok: false, output: JSON.stringify({ error: problem }), findings: [], tracker: [] }
  try {
    const result = spec.run(args as Args, store)
    const failed = typeof (result as { error?: unknown } | null)?.error === 'string'
    return { name, label: spec.label, ok: !failed, output: compactForModel(result), findings: findingsIn(result), tracker: trackerIn(result) }
  } catch (error) {
    console.error(`Tool ${name} failed:`, error instanceof Error ? error.message : error)
    return { name, label: spec.label, ok: false, output: JSON.stringify({ error: 'The data check failed. Try another way or tell the seller.' }), findings: [], tracker: [] }
  }
}
