import type { OrderSummaryRow } from '@shared/analytics.ts'
import { ArrowRight } from 'lucide-react'
import { StatusBadge } from '@/components/data/status'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatCurrency, formatDate } from '@/lib/format'

export function RecentOrders({ orders, className }: { orders: OrderSummaryRow[]; className?: string }) {
  return (
    <Card
      className={className}
      title="Recent orders"
      description="The latest orders across your store"
      actions={
        <ButtonLink to="/orders" variant="ghost" size="sm" trailingIcon={ArrowRight}>
          All orders
        </ButtonLink>
      }
    >
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">Recent orders</caption>
          <thead>
            <tr className="border-y border-line bg-surface-muted text-2xs font-semibold uppercase tracking-[0.06em] text-fg-muted">
              <th scope="col" className="px-5 py-2.5">Order</th>
              <th scope="col" className="px-5 py-2.5">Product</th>
              <th scope="col" className="px-5 py-2.5">Placed</th>
              <th scope="col" className="px-5 py-2.5 text-right">Amount</th>
              <th scope="col" className="px-5 py-2.5">Payment</th>
              <th scope="col" className="px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderId} className="border-b border-line last:border-b-0">
                <td className="whitespace-nowrap px-5 py-3 font-medium text-fg">{o.orderId}</td>
                <td className="max-w-64 truncate px-5 py-3 text-fg-secondary">{o.productName}</td>
                <td className="whitespace-nowrap px-5 py-3 text-fg-secondary">{formatDate(o.orderDate)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(o.totalAmount)}</td>
                <td className="px-5 py-3 text-fg-secondary">{o.paymentMethod}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={o.orderStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
