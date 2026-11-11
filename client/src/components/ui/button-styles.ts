import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-quint ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(29_14_69/0.24)] hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-fg shadow-card hover:border-ink-300 hover:bg-ink-25',
  ghost: 'text-fg-secondary hover:bg-ink-100 hover:text-fg',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption',
  md: 'h-9 px-3.5 text-sm',
}

const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  sm: 'size-8',
  md: 'size-9',
}

export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
  className?: string
} = {}): string {
  return cn(BASE, VARIANTS[variant], iconOnly ? ICON_ONLY_SIZES[size] : SIZES[size], className)
}
