import type { CatalogueHealth, ReviewAnalysis } from '@shared/analytics.ts'
import type { Review } from '@shared/records.ts'
import { MessageCircleQuestion, Star } from 'lucide-react'
import { CHART } from '@/components/charts/theme'
import { SegmentedBar } from '@/components/charts/SegmentedBar'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatTile, Unavailable } from '@/components/data/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAssistant } from '@/app/providers/assistant-context'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate, formatDecimal, formatPercent } from '@/lib/format'

type Row = Review & { productName: string }

const SENTIMENT_TONE = { Positive: 'positive', Neutral: 'neutral', Negative: 'negative' } as const
const SENTIMENT_COLOR = { Positive: CHART.positive, Neutral: CHART.previous, Negative: CHART.negative } as const

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className="size-3.5" strokeWidth={1.8} fill={n <= rating ? 'currentColor' : 'none'} color={n <= rating ? '#c98a00' : '#c3c3cf'} />
      ))}
    </span>
  )
}

const COLUMNS: Column<Row>[] = [
  { id: 'date', header: 'Date', sortValue: (r) => r.reviewDate, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.reviewDate)}</span> },
  { id: 'product', header: 'Product', sortValue: (r) => r.productName, cell: (r) => <p className="max-w-48 truncate text-fg">{r.productName}</p> },
  { id: 'rating', header: 'Rating', sortValue: (r) => r.rating, cell: (r) => <Stars rating={r.rating} /> },
  { id: 'review', header: 'Review (synthetic text)', cell: (r) => <p className="min-w-64 max-w-md text-fg-secondary">{r.reviewText}</p> },
  { id: 'sentiment', header: 'Sentiment', sortValue: (r) => r.sentiment, cell: (r) => <Badge tone={SENTIMENT_TONE[r.sentiment]}>{r.sentiment}</Badge> },
  { id: 'issue', header: 'Issue', sortValue: (r) => r.issueCategory, cell: (r) => (r.issueCategory === 'None' ? <span className="text-fg-muted">None</span> : r.issueCategory) },
]

const unique = (rows: Row[], pick: (r: Row) => string) => [...new Set(rows.map(pick))].sort()

export function ReviewsPage() {
  useDocumentTitle('Ratings & Reviews')
  const { openAssistant } = useAssistant()
  const analysis = useApi<ReviewAnalysis>('/api/analytics/reviews')
  const catalogue = useApi<CatalogueHealth>('/api/analytics/catalogue')
  const reviews = useApi<Row[]>('/api/reviews?limit=200')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ratings & Reviews"
        description="What customers say about your products: sentiment, common complaints and the products with poor reviews."
        actions={
          <Button icon={MessageCircleQuestion} onClick={() => openAssistant('Which products are getting poor reviews?')}>
            Ask about reviews
          </Button>
        }
      />
      <Loaded state={analysis} label="review analysis">
        {(a, meta) => {
          const negative = a.sentiment.find((s) => s.key === 'Negative')
          const average = a.byProduct.length ? a.byProduct.reduce((s, p) => s + p.averageRating * p.reviews, 0) / a.total : 0
          return (
            <>
              <SourceNote meta={meta}>{a.note} There are only {a.total} recent reviews, so treat patterns as signals, not proof.</SourceNote>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Recent reviews" value={String(a.total)} />
                <StatTile label="Average rating (recent)" value={formatDecimal(average)} sub="out of 5" />
                <StatTile label="Negative reviews" value={String(negative?.count ?? 0)} sub={negative ? formatPercent(negative.share) : undefined} tone={negative && negative.share > 0.3 ? 'negative' : undefined} />
                <StatTile label="Top complaint" value={a.issues[0]?.key ?? 'None'} sub={a.issues[0] ? `${a.issues[0].count} reviews` : undefined} />
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <Card title="Sentiment" description="Recent reviews">
                  <SegmentedBar label="Review sentiment" segments={a.sentiment.map((s) => ({ label: s.key, value: s.count, color: SENTIMENT_COLOR[s.key as keyof typeof SENTIMENT_COLOR] ?? CHART.previous }))} />
                  <h3 className="mt-5 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Complaints</h3>
                  <ul className="mt-2 space-y-1.5 text-caption">
                    {a.issues.map((i) => (
                      <li key={i.key} className="flex justify-between gap-3">
                        <span className="text-fg-secondary">{i.key}</span>
                        <span className="font-medium tabular-nums text-fg">{i.count}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="xl:col-span-2" title="By product" description="Most negative first">
                  <ul className="divide-y divide-line" data-testid="reviews-by-product">
                    {a.byProduct.map((p) => (
                      <li key={p.productId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-caption">
                        <span className="min-w-0 flex-1 basis-48 truncate text-fg-secondary">{p.productName}</span>
                        <Stars rating={Math.round(p.averageRating)} />
                        <span className="w-10 text-right font-semibold tabular-nums text-fg">{formatDecimal(p.averageRating)}</span>
                        <span className={p.negative ? 'w-24 text-negative' : 'w-24 text-fg-muted'}>
                          {p.negative} of {p.reviews} negative
                        </span>
                        <span className="w-full text-2xs text-fg-muted sm:w-auto">{p.issues.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          )
        }}
      </Loaded>
      <Loaded state={catalogue} label="listing ratings">
        {(c) =>
          c.lowRated.length > 0 && (
            <Card title="Low-rated listings" description="Overall listing rating across all time (synthetic)">
              <ul className="flex flex-wrap gap-2">
                {c.lowRated.map((p) => (
                  <li key={p.productId} className="rounded-control border border-line px-3 py-1.5 text-caption">
                    <span className="text-fg-secondary">{p.productName}</span> <span className="font-semibold text-negative">{formatDecimal(p.rating)}★</span>
                  </li>
                ))}
              </ul>
            </Card>
          )
        }
      </Loaded>
      <Loaded state={reviews} label="reviews">
        {(rows) => (
          <Card title="All recent reviews" description={`${rows.length} reviews`}>
            <DataTable
              caption="Reviews"
              rows={rows}
              columns={COLUMNS}
              rowKey={(r) => r.reviewId}
              search={{ placeholder: 'Search product or review text', text: (r) => `${r.productName} ${r.reviewText}` }}
              filters={[
                { id: 'sentiment', label: 'Sentiments', options: unique(rows, (r) => r.sentiment), value: (r) => r.sentiment },
                { id: 'issue', label: 'Issues', options: unique(rows, (r) => r.issueCategory), value: (r) => r.issueCategory },
              ]}
              initialSort={{ id: 'date', direction: 'desc' }}
              minWidth="60rem"
            />
          </Card>
        )}
      </Loaded>
      <Unavailable
        title="Not available in this demo"
        reason="The demo has a small set of recent reviews, not the full review history."
        items={['Rating trend over time', 'Replying to reviews', 'Seller (service) rating', 'Review photos']}
      />
    </div>
  )
}
