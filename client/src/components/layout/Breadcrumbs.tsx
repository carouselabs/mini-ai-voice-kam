import { ChevronRight } from 'lucide-react'
import { useLocation } from 'react-router'
import { findNavItem, sectionLabel } from '@/app/navigation'
import { cn } from '@/lib/cn'

/** Section › current page. The last crumb is the current page title. */
export function Breadcrumbs({ className }: { className?: string }) {
  const { pathname } = useLocation()
  const item = findNavItem(pathname)

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {item && (
          <li className="hidden shrink-0 items-center gap-1.5 text-fg-muted sm:flex">
            {sectionLabel(item.section)}
            <ChevronRight aria-hidden className="size-3.5 text-fg-subtle" strokeWidth={2} />
          </li>
        )}
        <li className="min-w-0">
          <span aria-current="page" className="block truncate font-semibold text-fg">
            {item?.label ?? 'Page not found'}
          </span>
        </li>
      </ol>
    </nav>
  )
}
