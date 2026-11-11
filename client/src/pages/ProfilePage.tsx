import type { CatalogueHealth } from '@shared/analytics.ts'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatTile, Unavailable } from '@/components/data/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import type { SellerProfileResponse } from '@/hooks/useSeller'
import { formatDate } from '@/lib/format'

export function ProfilePage() {
  useDocumentTitle('Seller profile')
  const profile = useApi<SellerProfileResponse>('/api/seller/profile')
  const catalogue = useApi<CatalogueHealth>('/api/analytics/catalogue')

  return (
    <div className="space-y-6">
      <PageHeader title="Seller profile" description="Store details for this demonstration seller account." />
      <Loaded state={profile} label="seller profile">
        {(s, meta) => (
          <>
            <SourceNote meta={meta} />
            <div className="grid gap-4 xl:grid-cols-3">
              <Card title={s.sellerName} description={`${s.sellerId} · ${s.marketplace}`} actions={<Badge tone={s.accountStatus === 'Active' ? 'positive' : 'warning'}>{s.accountStatus}</Badge>}>
                <dl className="space-y-2 text-caption">
                  {[
                    ['Categories', s.businessCategory.join(', ')],
                    ['Location', s.businessLocation],
                    ['Selling since', formatDate(s.registrationDate)],
                    ['Account manager', s.accountManager],
                    ['Data mode', `${s.dataMode} (demonstration data)`],
                    ['Data last updated', formatDate(s.lastDataUpdated)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-fg-muted">{k}</dt>
                      <dd className="text-right font-medium text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card className="xl:col-span-2" title="How the demo data was built" description="Assumptions behind the figures">
                <ul className="list-disc space-y-1 pl-5 text-caption text-fg-secondary marker:text-fg-subtle">
                  {s.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Card>
            </div>
          </>
        )}
      </Loaded>
      <Loaded state={catalogue} label="catalogue">
        {(c) => (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Products" value={String(c.products)} />
            <StatTile label="SKUs (sizes and colours)" value={String(c.skus)} />
            <StatTile label="Fully in stock" value={String(c.listingStatus.find((l) => l.key === 'Active')?.count ?? 0)} sub="listings" />
            <StatTile label="No orders this month" value={String(c.zeroOrderProducts.length)} sub="products" tone={c.zeroOrderProducts.length ? 'warning' : undefined} />
          </div>
        )}
      </Loaded>
      <Unavailable title="Not available in this demo" reason="A real seller account would also have these." items={['Seller tier and account health score', 'Business documents (GST, bank)', 'Team members with access', 'Pickup addresses']} />
    </div>
  )
}
