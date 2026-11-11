import { ChevronRight, X } from 'lucide-react'
import { useId, type Ref } from 'react'
import { NavLink } from 'react-router'
import { FOOTER_ITEMS, NAV_SECTIONS, PROFILE_ITEM } from '@/app/navigation'
import { BrandOrb } from '@/components/brand/OrbitGlyph'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useSeller } from '@/hooks/useSeller'
import { cn } from '@/lib/cn'
import type { NavSection } from '@/types'
import { SellerAvatar } from './SellerAvatar'
import { SidebarLink } from './SidebarLink'

interface SidebarProps {
  /** Icon-only rail (desktop). */
  collapsed?: boolean
  /** Called after a link is chosen (closes the phone drawer). */
  onNavigate?: () => void
  /** Shows a close button (phone drawer). */
  onClose?: () => void
  closeButtonRef?: Ref<HTMLButtonElement>
}

export function Sidebar({ collapsed = false, onNavigate, onClose, closeButtonRef }: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div
        className={cn(
          'flex h-topbar shrink-0 items-center gap-3 border-b border-line',
          collapsed ? 'justify-center' : 'px-5',
        )}
      >
        <BrandOrb />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[0.9375rem] font-bold tracking-[0.08em] text-fg">MINI AI</p>
            <p className="truncate text-2xs text-fg-muted">Virtual Key Account Manager</p>
          </div>
        )}
        {collapsed && <span className="sr-only">Mini AI, Virtual Key Account Manager</span>}
        {onClose && (
          <IconButton ref={closeButtonRef} icon={X} label="Close navigation" onClick={onClose} tooltip={false} />
        )}
      </div>

      <nav aria-label="Main" className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {NAV_SECTIONS.map((section, index) => (
          <NavGroup
            key={section.id}
            section={section}
            collapsed={collapsed}
            first={index === 0}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="shrink-0 border-t border-line px-3 py-3">
        <nav aria-label="Account">
          <ul className="space-y-0.5">
            {FOOTER_ITEMS.map((item) => (
              <li key={item.id}>
                <SidebarLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </nav>
        <SellerCard collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  )
}

function NavGroup({
  section,
  collapsed,
  first,
  onNavigate,
}: {
  section: NavSection
  collapsed: boolean
  first: boolean
  onNavigate?: () => void
}) {
  const headingId = useId()
  return (
    <div role="group" aria-labelledby={headingId} className={cn(!first && (collapsed ? 'mt-3' : 'mt-5'))}>
      <h2
        id={headingId}
        className={
          collapsed ? 'sr-only' : 'px-2.5 pb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted'
        }
      >
        {section.label}
      </h2>
      {collapsed && !first && <div aria-hidden className="mx-auto mb-3 h-px w-6 bg-line-strong" />}
      <ul className="space-y-0.5">
        {section.items.map((item) => (
          <li key={item.id}>
            <SidebarLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SellerCard({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { name, accountLabel } = useSeller()
  const card = (
    <NavLink
      to={PROFILE_ITEM.path}
      onClick={onNavigate}
      aria-label={`${PROFILE_ITEM.label}: ${name}, ${accountLabel.toLowerCase()}`}
      className={({ isActive }) =>
        cn(
          'mt-2 flex items-center gap-3 rounded-control p-2 transition-colors duration-150',
          collapsed ? 'mx-auto w-12 justify-center' : 'w-full',
          isActive ? 'bg-brand-50' : 'hover:bg-ink-100',
        )
      }
    >
      <SellerAvatar />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-caption font-semibold text-fg">{name}</span>
            <span className="block truncate text-2xs text-fg-muted">{accountLabel}</span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.8} />
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return card
  return (
    <Tooltip content={name} side="right" className="flex w-full">
      {card}
    </Tooltip>
  )
}
