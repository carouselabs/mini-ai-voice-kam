import type { LucideIcon } from 'lucide-react'
import type { Ref } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import { Breadcrumbs } from './Breadcrumbs'
import { DateRangeControl } from './DateRangeControl'
import { DemoBadge } from './DemoBadge'
import { NotificationsMenu } from './NotificationsMenu'
import { ProfileMenu } from './ProfileMenu'

export interface NavToggle {
  icon: LucideIcon
  label: string
  expanded: boolean
  controls: string
  onClick: () => void
}

export function Topbar({ navToggle, navToggleRef }: { navToggle: NavToggle; navToggleRef: Ref<HTMLButtonElement> }) {
  return (
    <header className="sticky top-0 z-30 flex h-topbar items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3 sm:px-5 xl:px-8">
      <IconButton
        ref={navToggleRef}
        icon={navToggle.icon}
        label={navToggle.label}
        aria-expanded={navToggle.expanded}
        aria-controls={navToggle.controls}
        onClick={navToggle.onClick}
        className="-ml-1"
      />
      <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
      <Breadcrumbs className="flex-1" />
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <DemoBadge />
        <DateRangeControl />
        <NotificationsMenu />
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <ProfileMenu />
      </div>
    </header>
  )
}
