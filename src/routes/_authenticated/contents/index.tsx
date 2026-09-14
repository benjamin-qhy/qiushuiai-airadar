import { createFileRoute } from '@tanstack/react-router'
import { AllContentsPage } from '@/features/airadar/pages'

export const Route = createFileRoute('/_authenticated/contents/')({
  component: AllContentsPage,
})
