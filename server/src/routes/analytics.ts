import { Router } from 'express'
import type { SourceType } from '../../../shared/records.ts'
import { getCatalogueHealth } from '../analytics/people.ts'
import { getStore, type Store } from '../data/store.ts'
import { parseQuery } from '../http/query.ts'
import { notFound, send } from '../http/respond.ts'
import { contextFor, type Context } from '../insights/context.ts'

export const analyticsRouter = Router()

const MIXED: SourceType[] = ['assignment_provided', 'synthetic_demo']
const SYNTHETIC: SourceType[] = ['synthetic_demo']

const ANALYSES: Record<string, { sources: SourceType[]; run: (ctx: Context, store: Store) => unknown }> = {
  revenue: { sources: MIXED, run: (ctx) => ctx.revenue },
  orders: { sources: MIXED, run: (ctx) => ctx.orders },
  cancellations: { sources: MIXED, run: (ctx) => ctx.cancellations },
  returns: { sources: SYNTHETIC, run: (ctx) => ctx.returns },
  inventory: { sources: MIXED, run: (ctx) => ctx.inventory },
  products: { sources: SYNTHETIC, run: (ctx) => ctx.products },
  delivery: { sources: SYNTHETIC, run: (ctx) => ctx.delivery },
  profitability: { sources: SYNTHETIC, run: (ctx) => ctx.profitability },
  pricing: { sources: SYNTHETIC, run: (ctx) => ctx.pricing },
  reviews: { sources: SYNTHETIC, run: (ctx) => ctx.reviews },
  customers: { sources: SYNTHETIC, run: (ctx) => ctx.customers },
  catalogue: { sources: SYNTHETIC, run: (_ctx, store) => getCatalogueHealth(store) },
}

analyticsRouter.get('/:kind', (req, res) => {
  const analysis = ANALYSES[req.params.kind]
  if (!analysis) throw notFound(`Analysis "${req.params.kind}"`)
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, analysis.run(contextFor(store), store), analysis.sources)
})
