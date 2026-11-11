import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { buttonClasses, type ButtonSize } from './button-styles'
import { Tooltip, type TooltipSide } from './Tooltip'

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: LucideIcon
  /** Accessible name. Also used as the tooltip text. */
  label: string
  variant?: 'ghost' | 'secondary'
  size?: ButtonSize
  /** Show the label as a tooltip on hover and keyboard focus. */
  tooltip?: TooltipSide | false
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  tooltip = 'bottom',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={buttonClasses({ variant, size, iconOnly: true, className })}
      {...rest}
    >
      <Icon aria-hidden className={size === 'sm' ? 'size-4' : 'size-[18px]'} strokeWidth={1.8} />
    </button>
  )

  if (!tooltip) return button
  return (
    <Tooltip content={label} side={tooltip}>
      {button}
    </Tooltip>
  )
}
