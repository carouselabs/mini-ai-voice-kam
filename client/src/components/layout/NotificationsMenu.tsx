import { Bell, BellOff } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Popover } from '@/components/ui/Popover'
import { Tooltip } from '@/components/ui/Tooltip'

export function NotificationsMenu() {
  return (
    <Popover
      label="Notifications"
      panelClassName="sm:w-80"
      trigger={(props) => (
        <Tooltip content="Notifications" side="bottom">
          <button
            {...props}
            type="button"
            aria-label="Notifications"
            className={buttonClasses({ variant: 'ghost', iconOnly: true })}
          >
            <Bell aria-hidden className="size-[18px]" strokeWidth={1.8} />
          </button>
        </Tooltip>
      )}
    >
      {() => (
        <>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-fg">Notifications</h2>
          </div>
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ink-100 text-fg-muted">
              <BellOff aria-hidden className="size-[18px]" strokeWidth={1.8} />
            </span>
            <p className="mt-3 text-sm font-medium text-fg">No notifications yet</p>
            <p className="mt-1 text-caption text-fg-muted">
              Alerts about sales, stock, cancellations and settlements will appear here once Mini AI is watching
              the demo dataset.
            </p>
          </div>
        </>
      )}
    </Popover>
  )
}
