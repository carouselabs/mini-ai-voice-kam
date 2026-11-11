import {
  Boxes,
  ClipboardCheck,
  ChartLine,
  CircleUser,
  CircleX,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  Megaphone,
  Package,
  Settings,
  ShoppingCart,
  Star,
  Truck,
  Undo2,
  Wallet,
} from 'lucide-react'
import type { NavItem, NavSection, NavSectionId } from '@/types'

/** Single source for the sidebar, routes, breadcrumbs and page titles. */
export const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/',
    icon: LayoutDashboard,
    section: 'business',
    description: 'How your store is performing this month compared with last month.',
  },
  {
    id: 'products',
    label: 'Products',
    path: '/products',
    icon: Package,
    section: 'business',
    description: 'Sales, visibility, conversion, ratings and stock for every product in your catalogue.',
    sampleQuestion: 'Which of my products are performing best?',
  },
  {
    id: 'orders',
    label: 'Orders',
    path: '/orders',
    icon: ShoppingCart,
    section: 'business',
    description: 'Every order and where it stands, from placed to delivered.',
    sampleQuestion: 'Why have my orders dropped this month?',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    path: '/inventory',
    icon: Boxes,
    section: 'business',
    description: 'Stock levels, out-of-stock products and what to restock first.',
    sampleQuestion: 'Which products should I restock first?',
  },
  {
    id: 'cancellations',
    label: 'Cancellations',
    path: '/cancellations',
    icon: CircleX,
    section: 'operations',
    description: 'Why orders are being cancelled, and by whom.',
    sampleQuestion: 'Why are cancellations increasing?',
  },
  {
    id: 'returns',
    label: 'Returns & Refunds',
    path: '/returns',
    icon: Undo2,
    section: 'operations',
    description: 'Returned orders, refund status and the reasons behind them.',
    sampleQuestion: 'Are customers returning products unnecessarily?',
  },
  {
    id: 'delivery',
    label: 'Delivery & Fulfilment',
    path: '/delivery',
    icon: Truck,
    section: 'operations',
    description: 'Dispatch speed, delivery performance and courier issues.',
    sampleQuestion: 'Is there a delivery or dispatch problem?',
  },
  {
    id: 'payments',
    label: 'Payments & Settlements',
    path: '/payments',
    icon: Wallet,
    section: 'operations',
    description: 'Payouts, upcoming settlements, fees and deductions.',
    sampleQuestion: 'When is my next settlement due?',
  },
  {
    id: 'promotions',
    label: 'Promotions',
    path: '/promotions',
    icon: Megaphone,
    section: 'growth',
    description: 'Campaigns, discounts and which products are worth promoting.',
    sampleQuestion: 'Which products should I promote?',
  },
  {
    id: 'reviews',
    label: 'Ratings & Reviews',
    path: '/reviews',
    icon: Star,
    section: 'growth',
    description: 'What customers say about your products and service.',
    sampleQuestion: 'Which products are getting poor reviews?',
  },
  {
    id: 'analytics',
    label: 'Business Analytics',
    path: '/analytics',
    icon: ChartLine,
    section: 'growth',
    description: 'Deeper trends across sales, categories, customers and regions.',
    sampleQuestion: 'Why have my sales declined?',
  },
  {
    id: 'review',
    label: 'Business Review',
    path: '/review',
    icon: ClipboardCheck,
    section: 'intelligence',
    description: 'Health, key risks, growth opportunities and your top three actions in one place.',
    sampleQuestion: 'Give me a business review',
  },
  {
    id: 'recommendations',
    label: 'AI Recommendations',
    path: '/recommendations',
    icon: Lightbulb,
    section: 'intelligence',
    description: 'Prioritised actions Mini AI suggests to grow your business.',
    sampleQuestion: 'What should I improve first?',
  },
  {
    id: 'actions',
    label: 'Action Tracker',
    path: '/actions',
    icon: ListChecks,
    section: 'intelligence',
    description: 'Actions you have committed to and how each one is going.',
    sampleQuestion: 'What actions have I committed to?',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    section: 'account',
    description: 'Store details, notifications and assistant preferences.',
  },
  {
    id: 'help',
    label: 'Help & Support',
    path: '/help',
    icon: LifeBuoy,
    section: 'account',
    description: 'Guides, answers to common questions and how to reach support.',
    sampleQuestion: 'How does Mini AI use my data?',
  },
  {
    id: 'profile',
    label: 'Seller profile',
    path: '/profile',
    icon: CircleUser,
    section: 'account',
    description: 'Store details for this demonstration seller account.',
  },
] as const satisfies readonly NavItem[]

const SECTION_LABELS: Record<NavSectionId, string> = {
  business: 'Business',
  operations: 'Operations',
  growth: 'Growth',
  intelligence: 'Intelligence',
  account: 'Account',
}

function sectionOf(id: NavSectionId): NavSection {
  return { id, label: SECTION_LABELS[id], items: NAV_ITEMS.filter((item) => item.section === id) }
}

/** Sections shown in the main sidebar list. */
export const NAV_SECTIONS: readonly NavSection[] = (
  ['business', 'operations', 'growth', 'intelligence'] as const
).map(sectionOf)

/** Pinned to the bottom of the sidebar (seller profile is shown as the seller card). */
export const FOOTER_ITEMS: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.id === 'settings' || item.id === 'help',
)

export const PROFILE_ITEM: NavItem = NAV_ITEMS.find((item) => item.id === 'profile')!
export const OVERVIEW_ITEM: NavItem = NAV_ITEMS[0]

/** Every page except Overview, which is the index route. */
export const MODULE_ITEMS: readonly NavItem[] = NAV_ITEMS.filter((item) => item.id !== 'overview')

export function sectionLabel(id: NavSectionId): string {
  return SECTION_LABELS[id]
}

export function findNavItem(pathname: string): NavItem | undefined {
  const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return NAV_ITEMS.find((item) => item.path === normalised)
}
