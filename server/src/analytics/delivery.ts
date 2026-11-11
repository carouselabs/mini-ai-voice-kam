import type { DeliveryAnalysis } from '../../../shared/analytics.ts'
import type { PeriodKey, Shipment } from '../../../shared/records.ts'
import { cancellationsIn, productName, shipmentsIn, type Store } from '../data/store.ts'
import { breakdown, compare, compareRates } from './compare.ts'
import { ratioOrZero, round, sum } from './math.ts'

export const DISPATCH_SLA_HOURS = 48

export const DELIVERY_DEFINITION = `On-time rate = shipments delivered by the promised date ÷ shipments delivered. Orders are promised within ${5} days; dispatch is promised within ${DISPATCH_SLA_HOURS} hours.`

const delivered = (list: Shipment[]) => list.filter((s) => s.actualDeliveryDate !== null)
const late = (list: Shipment[]) => list.filter((s) => s.deliveryStatus === 'Delivered Late')
const average = (values: number[]) => (values.length ? round(sum(values, (v) => v) / values.length, 1) : 0)

export function getDeliveryAnalysis(store: Store): DeliveryAnalysis {
  const prev = shipmentsIn(store, 'previous')
  const cur = shipmentsIn(store, 'current')
  const onTime = (list: Shipment[]) => round(1 - ratioOrZero(late(list).length, delivered(list).length), 4)
  const breaches = (list: Shipment[]) => list.filter((s) => s.sellerProcessingTime > DISPATCH_SLA_HOURS).length
  const deliveryCancellations = (period: PeriodKey) =>
    cancellationsIn(store, period).filter((c) => c.cancellationReason === 'Delivery Delay')
  const byStage = (period: PeriodKey, stage: string) =>
    cancellationsIn(store, period).filter((c) => (stage === 'after' ? c.cancellationStage === 'After Dispatch' : c.cancellationStage !== 'After Dispatch')).length

  const productIds = [...new Set(cur.map((s) => s.productId))]
  const slowestProducts = productIds
    .map((productId) => {
      const mine = cur.filter((s) => s.productId === productId)
      return {
        productId,
        productName: productName(store, productId),
        shipments: mine.length,
        averageProcessingHours: average(mine.map((s) => s.sellerProcessingTime)),
        slaBreaches: breaches(mine),
      }
    })
    .filter((p) => p.slaBreaches > 0)
    .sort((a, b) => b.slaBreaches - a.slaBreaches || b.averageProcessingHours - a.averageProcessingHours)

  const lateCur = late(cur)
  const sellerCaused = lateCur.filter((s) => s.sellerProcessingTime > DISPATCH_SLA_HOURS).length
  const logisticsCaused = lateCur.filter((s) => s.sellerProcessingTime <= DISPATCH_SLA_HOURS && s.logisticsDelay > 0).length
  const bottleneck: DeliveryAnalysis['bottleneck'] =
    lateCur.length === 0
      ? { stage: 'none', note: 'No late deliveries this month.' }
      : sellerCaused >= logisticsCaused
        ? {
            stage: 'seller_processing',
            note: `${sellerCaused} of ${lateCur.length} late deliveries were dispatched more than ${DISPATCH_SLA_HOURS} hours after the order.`,
          }
        : {
            stage: 'logistics',
            note: `${logisticsCaused} of ${lateCur.length} late deliveries were dispatched on time but spent longer in transit.`,
          }

  return {
    definition: DELIVERY_DEFINITION,
    onTimeRate: compareRates(onTime(prev), onTime(cur)),
    shipments: compare(prev.length, cur.length),
    delivered: compare(delivered(prev).length, delivered(cur).length),
    late: compare(late(prev).length, lateCur.length),
    averageDelayDays: compare(average(late(prev).map((s) => s.delayDays)), average(lateCur.map((s) => s.delayDays))),
    averageProcessingHours: compare(
      average(prev.map((s) => s.sellerProcessingTime)),
      average(cur.map((s) => s.sellerProcessingTime)),
    ),
    dispatchSlaBreaches: compare(breaches(prev), breaches(cur)),
    issues: breakdown(
      prev.filter((s) => s.deliveryIssue !== 'None'),
      cur.filter((s) => s.deliveryIssue !== 'None'),
      (s) => s.deliveryIssue,
    ),
    deliveryRelatedCancellations: compare(deliveryCancellations('previous').length, deliveryCancellations('current').length),
    cancelledBeforeDispatch: compare(byStage('previous', 'before'), byStage('current', 'before')),
    cancelledAfterDispatch: compare(byStage('previous', 'after'), byStage('current', 'after')),
    slowestProducts,
    bottleneck,
  }
}
