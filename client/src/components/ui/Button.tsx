import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles'

interface StyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  trailingIcon?: LucideIcon
}

function Content({ icon: Icon, trailingIcon: Trailing, children }: StyleProps & { children?: ReactNode }) {
  return (
    <>
      {Icon && <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.9} />}
      {children}
      {Trailing && <Trailing aria-hidden className="size-4 shrink-0" strokeWidth={1.9} />}
    </>
  )
}

export function Button({
  variant,
  size,
  icon,
  trailingIcon,
  className,
  children,
  type = 'button',
  ...rest
}: StyleProps & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClasses({ variant, size, className })} {...rest}>
      <Content icon={icon} trailingIcon={trailingIcon}>
        {children}
      </Content>
    </button>
  )
}

export function ButtonLink({ variant, size, icon, trailingIcon, className, children, ...rest }: StyleProps & LinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      <Content icon={icon} trailingIcon={trailingIcon}>
        {children}
      </Content>
    </Link>
  )
}
