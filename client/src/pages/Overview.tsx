import type { OverviewData } from '@shared/analytics.ts'
import { useAssistant } from '@/app/providers/assistant-context'
import { OrbitGlyph } from '@/components/brand/OrbitGlyph'
import { BusinessAlerts } from '@/components/dashboard/BusinessAlerts'
import { CancellationReturnOverview } from '@/components/dashboard/CancellationReturnOverview'
import { InventorySummary } from '@/components/dashboard/InventorySummary'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { METRIC_ICONS } from '@/components/dashboard/metric-icons'
import { OrderStatusDistribution } from '@/components/dashboard/OrderStatusDistribution'
import { ProductTable } from '@/components/dashboard/ProductTable'
import { RecentOrders } from '@/components/dashboard/RecentOrders'
import { OrdersChart, RevenueChart } from '@/components/dashboard/TrendCards'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useSeller } from '@/hooks/useSeller'

export function Overview() {
  useDocumentTitle('Overview')
  const { openAssistant } = useAssistant()
  const { name, periods } = useSeller()
  const overview = useApi<OverviewData>('/api/seller/overview')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          periods
            ? `How ${name} did in ${periods.current.label} compared with ${periods.previous.label}.`
            : 'How your store is doing this month compared with last month.'
        }
        actions={
          <Button variant="primary" onClick={() => openAssistant()}>
            <OrbitGlyph className="size-4" />
            Ask your Virtual KAM
          </Button>
        }
      />

      <Loaded state={overview} label="overview">
        {(data, meta) => {
          const byKey = Object.fromEntries(data.kpis.map((k) => [k.key, k]))
          const p = meta.periods
          return (
            <>
              <SourceNote meta={meta} />

              <section aria-labelledby="key-metrics">
                <h2 id="key-metrics" className="sr-only">
                  Key metrics
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                  {data.kpis.map((metric) => (
                    <MetricCard key={metric.key} metric={metric} icon={METRIC_ICONS[metric.key]} previousLabel={p.previous.shortLabel} />
                  ))}
                </div>
              </section>

              <div className="grid items-start gap-4 xl:grid-cols-3">
                <RevenueChart data={data.dailyTrend} periods={p} headline={byKey.sales} className="xl:col-span-2" />
                <BusinessAlerts alerts={data.alerts} />
              </div>

              <div className="grid items-start gap-4 xl:grid-cols-3">
                <OrdersChart data={data.dailyTrend} periods={p} headline={byKey.orders} className="xl:col-span-2" />
                <CancellationReturnOverview cancellations={data.cancellations} returns={data.returns} previousLabel={p.previous.shortLabel} />
              </div>

              <div className="grid items-start gap-4 xl:grid-cols-3">
                <ProductTable top={data.topProducts} declining={data.decliningProducts} className="xl:col-span-2" />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <OrderStatusDistribution distribution={data.statusDistribution} periodLabel={p.current.label} />
                  <InventorySummary inventory={data.inventory} />
                </div>
              </div>

              <RecentOrders orders={data.recentOrders} />
            </>
          )
        }}
      </Loaded>
    </div>
  )
}
