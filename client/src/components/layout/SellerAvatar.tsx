import { useSeller } from '@/hooks/useSeller'
import { cn } from '@/lib/cn'

export function SellerAvatar({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  const { initials } = useSeller()
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800 ring-1 ring-inset ring-brand-200',
        size === 'md' ? 'size-8 text-2xs' : 'size-10 text-caption',
        className,
      )}
    >
      {initials}
    </span>
  )
}
