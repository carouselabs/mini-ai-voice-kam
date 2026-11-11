import { ArrowLeft, Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Compass aria-hidden className="size-6" strokeWidth={1.8} />
      </span>
      <h1 className="mt-5 text-title font-semibold text-fg">Page not found</h1>
      <p className="mt-2 text-sm text-fg-muted">This page doesn’t exist in Mini AI. Head back to your overview.</p>
      <ButtonLink to="/" variant="primary" icon={ArrowLeft} className="mt-6">
        Back to Overview
      </ButtonLink>
    </div>
  )
}
