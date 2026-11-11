import { Mic, MessageCircleQuestion } from 'lucide-react'
import { useAssistant } from '@/app/providers/assistant-context'
import { Unavailable } from '@/components/data/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const QUESTIONS = [
  'Why have my sales dropped?',
  'Which products should I restock first?',
  'Why are cancellations increasing?',
  'Are customers returning products unnecessarily?',
  'What should I improve first?',
  'Give me a business review',
  'Add the restock action to my tracker',
  'What actions have I committed to?',
]

const FAQ: Array<[string, string]> = [
  ['Is this my real Snapdeal data?', 'No. It is a demonstration account. Headline figures come from the assignment brief; individual orders, products and reviews are synthetic. Every page says which is which.'],
  ['Can Mini AI change my listings, prices or stock?', 'No. Mini AI only reads data and recommends. It never contacts suppliers, couriers, customers or Snapdeal, and never changes anything in your store.'],
  ['What can Mini AI write?', 'Two things only: an entry in your action tracker marked Awaiting Approval when you ask for it, and a note of something you told it. You approve tracker entries yourself, and you can correct or delete notes in Settings.'],
  ['How sure is Mini AI?', 'Each finding shows a confidence level. “Supported” explanations appear in the records alongside a problem but are not proof they caused it; “hypotheses” are possibilities the data has not confirmed.'],
  ['Why does voice not work?', 'Voice uses your browser’s speech features. Use Chrome or Edge on desktop and allow the microphone. You can always type instead.'],
]

export function HelpPage() {
  useDocumentTitle('Help & Support')
  const { openAssistant } = useAssistant()
  return (
    <div className="space-y-6">
      <PageHeader title="Help & Support" description="How to get the most from Mini AI, your Virtual Key Account Manager." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Getting started">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-secondary marker:text-fg-muted">
            <li>Open Mini AI with the button at the bottom right. It checks your account first and tells you what matters most.</li>
            <li>
              Press <Mic aria-label="the microphone" className="inline size-4 align-text-bottom" /> and speak in English or Hindi, or type. You can interrupt it while it speaks.
            </li>
            <li>Each answer shows the checks it ran and the findings behind it. Open a finding to see the records.</li>
            <li>When a recommendation makes sense, add it to your Action Tracker and approve it. Track progress there.</li>
          </ol>
        </Card>
        <Card title="Try asking" description="Opens the assistant with the question ready to send">
          <ul className="grid gap-2 sm:grid-cols-2">
            {QUESTIONS.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => openAssistant(q)}
                  className="flex w-full items-start gap-2 rounded-control border border-brand-100 bg-brand-50/70 px-3 py-2 text-left text-caption font-medium text-brand-800 hover:border-brand-200 hover:bg-brand-50"
                >
                  <MessageCircleQuestion aria-hidden className="mt-px size-4 shrink-0 text-brand-600" />“{q}”
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Questions and answers">
        <dl className="divide-y divide-line">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-3">
              <dt className="text-sm font-medium text-fg">{q}</dt>
              <dd className="mt-1 text-caption text-fg-secondary">{a}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Unavailable title="Contact support" reason="This is a demonstration build, so there is no support desk behind it." items={['Raise a support ticket', 'Call or chat with a person']} />
    </div>
  )
}
