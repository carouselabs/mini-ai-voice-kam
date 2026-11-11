import { cn } from '@/lib/cn'

/** Rotated ellipse the satellite travels along (unrotated coordinates; the group applies the tilt). */
const ORBIT_PATH = 'M21.5 12 A9.5 4.3 0 1 1 2.5 12 A9.5 4.3 0 1 1 21.5 12'

/**
 * The Mini AI mark: a core with a tilted orbit and one satellite.
 * When animated, the satellite travels the orbit (the orb's idle state).
 */
export function OrbitGlyph({ animated = false, className }: { animated?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn('shrink-0', className)}>
      <circle cx="12" cy="12" r="3.4" fill="currentColor" />
      <g transform="rotate(-28 12 12)">
        <ellipse cx="12" cy="12" rx="9.5" ry="4.3" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.72" />
        {animated ? (
          <circle r="1.75" fill="currentColor">
            <animateMotion dur="6.5s" repeatCount="indefinite" path={ORBIT_PATH} />
          </circle>
        ) : (
          <circle cx="18.1" cy="8.7" r="1.75" fill="currentColor" />
        )}
      </g>
    </svg>
  )
}

/** The mark on its purple sphere, for the sidebar and assistant header. */
export function BrandOrb({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = {
    sm: 'size-7 [&_svg]:size-4',
    md: 'size-8 [&_svg]:size-[18px]',
    lg: 'size-10 [&_svg]:size-[22px]',
  }
  return (
    <span
      aria-hidden
      className={cn('orb-sphere relative grid shrink-0 place-items-center rounded-full text-white', sizes[size], className)}
    >
      <span className="orb-specular absolute inset-0 rounded-full" />
      <OrbitGlyph className="relative" />
    </span>
  )
}
