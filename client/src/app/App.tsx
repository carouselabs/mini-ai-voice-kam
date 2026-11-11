import { RouterProvider } from 'react-router/dom'
import { AssistantProvider } from './providers/AssistantProvider'
import { router } from './router'

export function App() {
  return (
    <AssistantProvider>
      <RouterProvider router={router} />
    </AssistantProvider>
  )
}
