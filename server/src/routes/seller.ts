import { Router } from 'express'
import { getOverview } from '../analytics/overview.ts'
import { getStore } from '../data/store.ts'
import { parseQuery } from '../http/query.ts'
import { send } from '../http/respond.ts'
import { contextFor } from '../insights/context.ts'

export const sellerRouter = Router()

sellerRouter.get('/profile', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, { ...store.seller, assumptions: store.manifest.assumptions }, ['synthetic_demo'])
})

sellerRouter.get('/overview', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, getOverview(contextFor(store)), ['assignment_provided', 'synthetic_demo'], {
    notes: store.manifest.assumptions,
  })
})
