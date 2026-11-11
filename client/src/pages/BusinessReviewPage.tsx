import type { BusinessReview, StructuredFinding } from '@shared/tracker.ts'
import { ArrowRight, ChevronDown, ListPlus, MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAssistant } from '@/app/providers/assistant-context'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { METRIC_ICONS } from '@/components/dashboard/metric-icons'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { STATE_LABEL } from '@/components/workspace/workspace'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useLiveApi } from '@/hooks/useLiveApi'
import { cn } from '@/lib/cn'
import { formatCurrency, formatDate, formatDecimal, formatPercent, formatPointChange } from '@/lib/format'

const SEVERITY_TONE = { critical: 'negative', high: 'warning', medium: 'brand', low: 'neutral' } as const
const CONFIDENCE_TONE = { high: 'positive', medium: 'warning', low: 'neutral' } as const

function HealthFigure({ label, previous, current, format, better }: { label: string; previous: number; current: number; format: (n: number) => string; better: 'up' | 'down' }) {
  const worse = better === 'up' ? current < previous : current > previous
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <p className="text-caption text-fg-muted">{label}</p>
      <p className="mt-1 text-metric font-semibold tabular-nums text-fg">{format(current)}</p>
      <p className={cn('text-2xs', worse ? 'text-negative' : 'text-positive')}>from {format(previous)}</p>
    </div>
  )
}

function List({ title, items, tone = 'text-fg-secondary' }: { title: string; items: string[]; tone?: string }) {
  if (!items.length) return null
  return (
    <div>
      <h5 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h5>
      <ul className={cn('mt-1 list-disc space-y-0.5 pl-5 marker:text-fg-subtle', tone)}>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

function Finding({ finding }: { finding: StructuredFinding }) {
  const [open, setOpen] = useState(false)
  return (
    <li data-finding={finding.findingId} className="rounded-control border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">{finding.problem}</span>
          <span className="block text-caption text-fg-muted">{finding.businessImpact}</span>
        </span>
        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
        <Badge tone={CONFIDENCE_TONE[finding.confidence]}>{finding.confidence} confidence</Badge>
        <ChevronDown aria-hidden className={cn('mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-line px-3 py-3 text-caption md:grid-cols-2">
          <div className="space-y-3">
            <List title="Verified in the records" items={finding.verifiedFacts} />
            <dl className="space-y-0.5">
              {finding.evidence.map((e) => (
                <div key={e.label} className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{e.label}</dt>
                  <dd className="text-right font-medium text-fg">{e.value}</dd>
                </div>
              ))}
            </dl>
            {finding.affected.length > 0 && <p className="text-fg-muted">Affected: {finding.affected.join(', ')}</p>}
          </div>
          <div className="space-y-3">
            <List title="Supported explanations (seen alongside, not proven causes)" items={finding.supportedExplanations} />
            <List title="Hypotheses (not confirmed by the data)" items={finding.hypotheses} tone="text-fg-muted italic" />
            <p>
              <span className="font-semibold text-fg">Next to investigate: </span>
              <span className="text-fg-secondary">{finding.nextInvestigation}</span>
            </p>
            {finding.correctiveActions.length > 0 && (
              <p className="text-fg-secondary">
                <span className="font-semibold text-fg">Corrective actions: </span>
                {finding.correctiveActions.map((a) => a.title).join('; ')}
              </p>
            )}
            {finding.link && (
              <Link to={finding.link} className="inline-flex items-center gap-1 font-medium text-accent-fg hover:underline">
                See the records <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export function BusinessReviewPage() {
  useDocumentTitle('Business Review')
  const { openAssistant } = useAssistant()
  const review = useLiveApi<BusinessReview>('/api/review')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Review"
        description="Your account in one place: how healthy it is, the biggest risks, where to grow, and the three actions that matter most."
        actions={
          <Button icon={MessageCircleQuestion} onClick={() => openAssistant('Give me a business review')}>
            Talk it through
          </Button>
        }
      />
      <Loaded state={review} label="business review">
        {(r, meta) => {
          const kpis = r.health.kpis
          return (
            <>
              <SourceNote meta={meta}>
                {r.periods.current.label} compared with {r.periods.previous.label}. {meta.notes?.join(' ')}
              </SourceNote>

              <section aria-labelledby="health" className="space-y-3">
                <h2 id="health" className="text-[0.9375rem] font-semibold text-fg">
                  1. Account health
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                  {kpis.map((m) => (
                    <MetricCard key={m.key} metric={m} icon={METRIC_ICONS[m.key]} previousLabel={r.periods.previous.shortLabel} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <HealthFigure label="On-time delivery" {...r.health.onTimeDelivery} format={formatPercent} better="up" />
                  <HealthFigure label="Hours to dispatch (avg)" {...r.health.averageDispatchHours} format={(n) => `${formatDecimal(n)} h`} better="down" />
                  <HealthFigure label="Estimated gross profit" {...r.health.estimatedGrossProfit} format={formatCurrency} better="up" />
                  <HealthFigure label="Estimated gross margin" {...r.health.grossMargin} format={formatPercent} better="up" />
                </div>
                <p className="text-2xs text-fg-muted">
                  Profit and margin are estimates before marketplace fees, shipping, ads and tax. Margin changed by{' '}
                  {formatPointChange((r.health.grossMargin.current - r.health.grossMargin.previous) * 100)}.
                </p>
              </section>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card title="2. Key risks" description="The most serious problems, one per area">
                  <ol className="space-y-3" data-testid="review-risks">
                    {r.risks.map((risk) => (
                      <li key={risk.title} className="text-caption">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={SEVERITY_TONE[risk.severity]}>{risk.severity}</Badge>
                          <Badge tone={CONFIDENCE_TONE[risk.confidence]}>{risk.confidence} confidence</Badge>
                          <span className="font-semibold text-fg">{risk.title}</span>
                        </div>
                        <p className="mt-1 text-fg-secondary">{risk.detail}</p>
                        {risk.link && (
                          <Link to={risk.link} className="mt-0.5 inline-flex items-center gap-1 text-2xs font-medium text-accent-fg hover:underline">
                            See the records <ArrowRight aria-hidden className="size-3" />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ol>
                </Card>
                <Card title="3. Growth opportunities" description="“Supported” is backed by the records; “Hypothesis” is a possibility the data has not shown">
                  <ul className="space-y-3" data-testid="review-opportunities">
                    {r.opportunities.map((o) => (
                      <li key={o.title} className="text-caption">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={o.basis === 'supported' ? 'positive' : 'outline'}>{o.basis === 'supported' ? 'Supported' : 'Hypothesis'}</Badge>
                          <span className="font-semibold text-fg">{o.title}</span>
                        </div>
                        <p className="mt-1 text-fg-secondary">{o.detail}</p>
                        {o.link && (
                          <Link to={o.link} className="mt-0.5 inline-flex items-center gap-1 text-2xs font-medium text-accent-fg hover:underline">
                            Open <ArrowRight aria-hidden className="size-3" />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <Card title="4. Action plan" description="The top three open recommendations, most urgent first. Rejected and completed ones are left out.">
                {r.actionPlan.length === 0 ? (
                  <p className="text-caption text-fg-muted">Every recommendation is completed or rejected.</p>
                ) : (
                  <ol className="grid gap-3 lg:grid-cols-3" data-testid="review-plan">
                    {r.actionPlan.map((a, i) => (
                      <li key={a.actionId} data-action={a.actionId} className="flex flex-col rounded-control border border-line p-3 text-caption">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="grid size-5 place-items-center rounded-full bg-accent text-2xs font-semibold text-white">{i + 1}</span>
                          <StatusBadge status={a.priority} />
                          <Badge tone="outline">{STATE_LABEL[a.state]}</Badge>
                        </div>
                        <p className="mt-2 font-semibold text-fg">{a.title}</p>
                        {a.caution && <p className="mt-1 font-medium text-warning">Check first: {a.caution}</p>}
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-secondary marker:text-fg-subtle">
                          {a.evidence.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                        <p className="mt-2 text-fg-muted">
                          Owner: {a.owner} · Then watch: {a.metricToMonitor}
                        </p>
                        <p className="text-2xs text-fg-muted">Suggested by {a.suggestedBy}</p>
                        <div className="mt-auto pt-2">
                          {a.state === 'proposed' ? (
                            <ButtonLink size="sm" variant="primary" icon={ListPlus} to="/recommendations">
                              Review and add
                            </ButtonLink>
                          ) : (
                            <ButtonLink size="sm" to="/actions">
                              Open in tracker
                            </ButtonLink>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              <Card title="Investigations" description="Each finding separates what the records verify, what they support, and what is only a hypothesis">
                <div className="space-y-5">
                  {r.investigations.map((inv) => (
                    <section key={inv.scenario} aria-label={inv.question}>
                      <h3 className="text-sm font-semibold text-fg">{inv.question}</h3>
                      <p className="text-caption text-fg-muted">{inv.headline}</p>
                      <ul className="mt-2 space-y-2">
                        {inv.findings.map((f) => (
                          <Finding key={f.findingId} finding={f} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </Card>

              <Card title="What you told Mini AI" description="Your own statements. Shown for context, never treated as verified data." actions={<ButtonLink size="sm" to="/settings">Manage</ButtonLink>}>
                {r.sellerContext.length === 0 ? (
                  <p className="text-caption text-fg-muted">Nothing yet. When you tell Mini AI something the data cannot show, such as a supplier date, it notes it here.</p>
                ) : (
                  <ul className="space-y-2 text-caption">
                    {r.sellerContext.map((m) => (
                      <li key={m.id}>
                        <span className="font-medium text-fg">{m.topic}: </span>
                        <span className="text-fg-secondary">{m.text}</span>
                        <span className="text-2xs text-fg-muted"> · {formatDate(m.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )
        }}
      </Loaded>
    </div>
  )
}
