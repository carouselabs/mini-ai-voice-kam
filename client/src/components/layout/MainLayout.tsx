import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { FloatingAIBrain } from '@/components/ai/FloatingAIBrain'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { usePersistentBoolean } from '@/hooks/usePersistentBoolean'
import { cn } from '@/lib/cn'
import { prefetchPages } from '@/lib/prefetch'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { Topbar, type NavToggle } from './Topbar'

const DESKTOP_SIDEBAR_ID = 'sidebar'
const MOBILE_SIDEBAR_ID = 'sidebar-drawer'

export function MainLayout() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [collapsed, setCollapsed] = usePersistentBoolean('mini-ai.sidebar-collapsed', false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navToggleRef = useRef<HTMLButtonElement>(null)

  // After the first screen, load the other pages' data in the background so navigation is instant.
  useEffect(() => prefetchPages(), [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    navToggleRef.current?.focus({ preventScroll: true })
  }, [])

  const navToggle: NavToggle = isDesktop
    ? {
        icon: collapsed ? PanelLeftOpen : PanelLeftClose,
        label: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
        expanded: !collapsed,
        controls: DESKTOP_SIDEBAR_ID,
        onClick: () => setCollapsed((value) => !value),
      }
    : {
        icon: Menu,
        label: 'Open navigation',
        expanded: drawerOpen,
        controls: MOBILE_SIDEBAR_ID,
        onClick: () => setDrawerOpen(true),
      }

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[80] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus:shadow-popover"
      >
        Skip to main content
      </a>

      <aside
        id={DESKTOP_SIDEBAR_ID}
        aria-label="Sidebar"
        data-collapsed={collapsed}
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-line transition-[width] duration-200 ease-out-quint lg:block',
          collapsed ? 'w-rail' : 'w-sidebar',
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      <MobileNav id={MOBILE_SIDEBAR_ID} open={drawerOpen && !isDesktop} onClose={closeDrawer} />

      <div
        className={cn(
          'flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 ease-out-quint',
          collapsed ? 'lg:pl-rail' : 'lg:pl-sidebar',
        )}
      >
        <Topbar navToggle={navToggle} navToggleRef={navToggleRef} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 xl:px-8">
          <div className="mx-auto w-full max-w-[100rem]">
            <Outlet />
          </div>
        </main>
      </div>

      <FloatingAIBrain />
      <ScrollRestoration />
    </div>
  )
}
