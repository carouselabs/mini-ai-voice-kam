import { RotateCcw, TriangleAlert } from 'lucide-react'
import { useRouteError } from 'react-router'
import { Button } from '@/components/ui/Button'

/** Last-resort screen when a page fails to render. */
export function RouteError() {
  const error = useRouteError()
  if (import.meta.env.DEV) console.error(error)

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-negative-soft text-negative">
          <TriangleAlert aria-hidden className="size-6" strokeWidth={1.8} />
        </span>
        <h1 className="mt-5 text-title font-semibold text-fg">Something went wrong</h1>
        <p className="mt-2 text-sm text-fg-muted">This page couldn’t be shown. Reloading usually fixes it.</p>
        <Button variant="primary" icon={RotateCcw} className="mt-6" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </main>
  )
}
