import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { MainLayout } from '@/components/layout/MainLayout'
import { ActionTrackerPage } from '@/pages/ActionTrackerPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { BusinessReviewPage } from '@/pages/BusinessReviewPage'
import { DeliveryPage } from '@/pages/DeliveryPage'
import { HelpPage } from '@/pages/HelpPage'
import { NotFound } from '@/pages/NotFound'
import { Overview } from '@/pages/Overview'
import { PaymentsPage } from '@/pages/PaymentsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { PromotionsPage } from '@/pages/PromotionsPage'
import { RecommendationsPage } from '@/pages/RecommendationsPage'
import { CancellationsPage } from '@/pages/records/CancellationsPage'
import { InventoryPage } from '@/pages/records/InventoryPage'
import { OrdersPage } from '@/pages/records/OrdersPage'
import { ProductsPage } from '@/pages/records/ProductsPage'
import { ReturnsPage } from '@/pages/records/ReturnsPage'
import { ReviewsPage } from '@/pages/ReviewsPage'
import { RouteError } from '@/pages/RouteError'
import { SettingsPage } from '@/pages/SettingsPage'
import { MODULE_ITEMS, NAV_ITEMS } from './navigation'

/** One page per sidebar item. A missing entry is a type error, not a blank screen. */
const PAGES: Record<Exclude<(typeof NAV_ITEMS)[number]['id'], 'overview'>, ComponentType> = {
  products: ProductsPage,
  orders: OrdersPage,
  inventory: InventoryPage,
  cancellations: CancellationsPage,
  returns: ReturnsPage,
  delivery: DeliveryPage,
  payments: PaymentsPage,
  promotions: PromotionsPage,
  reviews: ReviewsPage,
  analytics: AnalyticsPage,
  review: BusinessReviewPage,
  recommendations: RecommendationsPage,
  actions: ActionTrackerPage,
  settings: SettingsPage,
  help: HelpPage,
  profile: ProfilePage,
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: MainLayout,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: Overview },
      ...MODULE_ITEMS.map((item) => {
        const Page = PAGES[item.id as keyof typeof PAGES]
        return { path: item.path.slice(1), element: <Page key={item.id} /> }
      }),
      { path: '*', Component: NotFound },
    ],
  },
])
