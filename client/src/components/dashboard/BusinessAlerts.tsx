import type { Alert } from '@shared/analytics.ts'
import { ArrowRight, Boxes, CircleX, Truck, Undo2, type LucideIcon } from 'lucide-react'
import { StatusBadge } from '@/components/data/status'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const ICONS: Partial<Record<Alert['category'], LucideIcon>> = {
  inventory: Boxes,
  cancellations: CircleX,
  returns: Undo2,
  delivery: Truck,
}

export function BusinessAlerts({ alerts, className }: { alerts: Alert[]; className?: string }) {
  return (
    <Card
      className={className}
      title="Business alerts & insights"
      description="What needs your attention first"
      bodyClassName="px-0 pb-2 pt-3"
      footer={
        <ButtonLink to="/recommendations" variant="ghost" size="sm" trailingIcon={ArrowRight} className="-ml-2">
          AI recommendations
        </ButtonLink>
      }
    >
      <ul className="divide-y divide-line">
        {alerts.slice(0, 4).map((alert) => {
          const Icon = ICONS[alert.category] ?? Boxes
          return (
            <li key={alert.id} className="flex gap-3 px-5 py-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-700">
                <Icon aria-hidden className="size-4" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-caption font-semibold text-fg">{alert.title}</p>
                  <StatusBadge status={alert.severity} />
                </div>
                <p className="mt-0.5 text-caption text-fg-muted">{alert.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
