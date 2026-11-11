import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'
import { createApp } from '../src/app.ts'

let base = ''
let close: () => void = () => {}

before(async () => {
  const server = createApp().listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  close = () => server.close()
})
after(() => close())

// Response bodies are checked field by field below, so a loose type keeps the assertions readable.
// oxlint-disable-next-line typescript/no-explicit-any
type Json = any

async function get(path: string): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, body: await res.json() }
}

async function ok(path: string): Promise<Json> {
  const { status, body } = await get(path)
  assert.equal(status, 200, `${path} → ${status} ${JSON.stringify(body).slice(0, 200)}`)
  assert.equal(body.meta.dataMode, 'DEMO')
  assert.ok(body.meta.lastUpdatedAt)
  assert.ok(Array.isArray(body.meta.sourceTypes))
  return body
}

describe('read endpoints', () => {
  const endpoints = [
    '/health',
    '/seller/profile',
    '/seller/overview',
    ...['revenue', 'orders', 'cancellations', 'returns', 'inventory', 'products', 'delivery', 'profitability', 'pricing', 'reviews', 'customers', 'catalogue'].map((k) => `/analytics/${k}`),
    '/products',
    '/products/PRD-001',
    '/orders',
    '/orders/ORD-202610-0001',
    '/cancellations',
    '/returns',
    '/inventory',
    '/customers/patterns',
    '/suppliers',
    '/reviews',
    '/shipments',
    ...['sales-decline', 'cancellations', 'returns', 'inventory', 'visibility', 'pricing', 'overview'].map((s) => `/investigations/${s}`),
    '/actions/recommendations',
    '/data-quality',
  ]
  for (const path of endpoints) {
    test(path, async () => {
      if (path === '/health') {
        const { status, body } = await get(path)
        assert.equal(status, 200)
        assert.equal(body.status, 'ok')
      } else {
        await ok(path)
      }
    })
  }
})

describe('content', () => {
  test('overview headline metrics are the assignment figures', async () => {
    const { data } = await ok('/seller/overview')
    const sales = data.kpis.find((k: { key: string }) => k.key === 'sales')
    assert.equal(sales.current, 135_000)
    assert.equal(sales.source, 'assignment_provided')
    assert.equal(sales.tone, 'negative')
    const returns = data.kpis.find((k: { key: string }) => k.key === 'returnRate')
    assert.equal(returns.source, 'synthetic_demo')
    assert.equal(data.dailyTrend.length, 31)
  })

  test('seller profile is the demo seller', async () => {
    const { data } = await ok('/seller/profile')
    assert.equal(data.sellerName, 'UrbanCart Fashion & Lifestyle')
    assert.equal(data.sellerId, 'DEMO-SELLER-001')
    assert.equal(data.dataMode, 'DEMO')
  })

  test('data quality reports a pass', async () => {
    const { data } = await ok('/data-quality')
    assert.equal(data.passed, true)
  })
})

describe('filters', () => {
  test('orders by period and status', async () => {
    const body = await ok('/orders?period=current&status=Cancelled')
    assert.equal(body.meta.total, 38)
    assert.ok(body.data.every((o: { orderStatus: string; period: string }) => o.orderStatus === 'Cancelled' && o.period === 'current'))
  })

  test('orders by date range, product and paging', async () => {
    const range = await ok('/orders?startDate=2026-10-01&endDate=2026-10-07')
    assert.ok(range.meta.total > 0 && range.meta.total < 270)
    const product = await ok('/orders?productId=PRD-020&period=current')
    assert.equal(product.meta.total, 0)
    const page = await ok('/orders?limit=10&offset=5')
    assert.equal(page.data.length, 10)
    assert.equal(page.meta.total, 670)
  })

  test('products by category, status and search', async () => {
    const fashion = await ok('/products?category=Fashion')
    assert.ok(fashion.data.every((p: { category: string }) => p.category === 'Fashion'))
    const search = await ok('/products?q=earbuds')
    assert.equal(search.meta.total, 1)
    const oos = await ok('/products?status=Out%20of%20stock')
    assert.ok(oos.data.every((p: { performanceStatus: string }) => p.performanceStatus === 'Out of stock'))
  })

  test('inventory by status', async () => {
    const body = await ok('/inventory?status=Replenishment%20Pending')
    assert.equal(body.meta.total, 5)
  })
})

describe('errors', () => {
  const bad = [
    ['/orders?colour=red', 'Unknown parameter: colour'],
    ['/orders?startDate=2026-13-01', 'startDate must be a date'],
    ['/orders?startDate=2026-10-10&endDate=2026-10-01', 'startDate must be on or before endDate'],
    ['/orders?status=Lost', 'status must be one of'],
    ['/orders?productId=PRD-999', 'Unknown productId'],
    ['/orders?limit=0', 'limit must be'],
    ['/products?category=Toys', 'category must be one of'],
    ['/orders?period=last-year', 'period must be one of'],
  ] as const
  for (const [path, message] of bad) {
    test(`400 for ${path}`, async () => {
      const { status, body } = await get(path)
      assert.equal(status, 400)
      assert.equal(body.error.code, 'bad_request')
      assert.ok(body.error.details.some((d: string) => d.includes(message)), JSON.stringify(body))
    })
  }

  test('404s share one shape', async () => {
    for (const path of ['/products/PRD-999', '/orders/ORD-0', '/investigations/weather', '/analytics/astrology', '/nothing']) {
      const { status, body } = await get(path)
      assert.equal(status, 404, path)
      assert.equal(body.error.code, 'not_found')
      assert.ok(body.error.message)
    }
  })
})
