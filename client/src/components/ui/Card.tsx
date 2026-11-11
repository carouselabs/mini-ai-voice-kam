import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CardProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: string
  description?: ReactNode
  /** Controls or a summary figure shown at the right of the header. */
  actions?: ReactNode
  footer?: ReactNode
  bodyClassName?: string
}

export function Card({ title, description, actions, footer, bodyClassName, className, children, ...rest }: CardProps) {
  const headingId = useId()

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('flex min-w-0 flex-col rounded-card border border-line bg-surface shadow-card', className)}
      {...rest}
    >
      {title && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4">
          <div className="min-w-0">
            <h2 id={headingId} className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-caption text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('flex-1 px-5 pb-5 pt-4', bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
    </section>
  )
}
