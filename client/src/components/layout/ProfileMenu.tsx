import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import { FOOTER_ITEMS, PROFILE_ITEM } from '@/app/navigation'
import { Badge } from '@/components/ui/Badge'
import { Popover } from '@/components/ui/Popover'
import { useSeller } from '@/hooks/useSeller'
import { cn } from '@/lib/cn'
import { SellerAvatar } from './SellerAvatar'

const MENU_ITEMS = [PROFILE_ITEM, ...FOOTER_ITEMS]

export function ProfileMenu() {
  const { name, accountLabel } = useSeller()
  return (
    <Popover
      label="Seller account"
      panelClassName="sm:w-72"
      trigger={(props, open) => (
        <button
          {...props}
          type="button"
          aria-label={`Seller account: ${name}`}
          className="flex items-center gap-2.5 rounded-control p-1 transition-colors duration-150 hover:bg-ink-100 sm:pr-2"
        >
          <SellerAvatar />
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-caption font-semibold text-fg">{name}</span>
            <span className="block text-2xs text-fg-muted">Demo seller</span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'hidden size-3.5 text-fg-subtle transition-transform duration-150 ease-out-quint sm:block',
              open && 'rotate-180',
            )}
          />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 border-b border-line p-4">
            <SellerAvatar size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{name}</p>
              <p className="truncate text-caption text-fg-muted">{accountLabel}</p>
            </div>
            <Badge tone="brand">DEMO</Badge>
          </div>
          <ul className="p-1.5">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    onClick={close}
                    className="flex h-9 items-center gap-3 rounded-control px-2.5 text-caption font-medium text-fg-secondary transition-colors duration-150 hover:bg-ink-100 hover:text-fg"
                  >
                    <Icon aria-hidden className="size-4 text-ink-500" strokeWidth={1.8} />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-line px-4 py-3 text-2xs text-fg-muted">
            This is a demonstration. No real marketplace account is connected.
          </p>
        </>
      )}
    </Popover>
  )
}
