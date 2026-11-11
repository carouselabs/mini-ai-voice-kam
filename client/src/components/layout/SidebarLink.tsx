import { NavLink } from 'react-router'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import type { NavItem } from '@/types'

interface SidebarLinkProps {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}

export function SidebarLink({ item, collapsed, onNavigate }: SidebarLinkProps) {
  const Icon = item.icon

  const link = (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex h-8 items-center gap-3 rounded-control text-caption font-medium transition-colors duration-150',
          collapsed ? 'mx-auto w-10 justify-center' : 'w-full px-2.5',
          isActive ? 'bg-brand-50 text-brand-800' : 'text-fg-secondary hover:bg-ink-100 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-brand-600" />
          )}
          <Icon
            aria-hidden
            strokeWidth={1.8}
            className={cn(
              'size-[18px] shrink-0 transition-colors duration-150',
              isActive ? 'text-brand-600' : 'text-ink-500 group-hover:text-ink-700',
            )}
          />
          <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip content={item.label} side="right" className="flex w-full">
      {link}
    </Tooltip>
  )
}
