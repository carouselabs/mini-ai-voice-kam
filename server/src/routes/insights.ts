import { Router } from 'express'
import type { InvestigationScenario } from '../../../shared/insights.ts'
import { getStore } from '../data/store.ts'
import { parseQuery } from '../http/query.ts'
import { notFound, send } from '../http/respond.ts'
import { recommendationsWithFindings, runInvestigation } from '../investigations/index.ts'
import { validateStore } from '../quality/validate.ts'
import { getWorkspace } from '../workspace/index.ts'

const SCENARIOS: InvestigationScenario[] = ['sales-decline', 'cancellations', 'returns', 'inventory', 'visibility', 'pricing', 'overview']

export const investigationsRouter = Router()

investigationsRouter.get('/:scenario', (req, res) => {
  const scenario = req.params.scenario as InvestigationScenario
  if (!SCENARIOS.includes(scenario)) throw notFound(`Investigation "${req.params.scenario}"`)
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, runInvestigation(store, scenario), ['assignment_provided', 'synthetic_demo'])
})

export const actionsRouter = Router()

actionsRouter.get('/recommendations', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, getWorkspace().tracker.views(recommendationsWithFindings(store)), ['assignment_provided', 'synthetic_demo', 'seller_provided'], {
    notes: ['Recommendations only. Mini AI does not contact anyone or change anything; each action needs the seller’s approval.'],
  })
})

export const qualityRouter = Router()

qualityRouter.get('/', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, validateStore(store), ['derived'])
})
