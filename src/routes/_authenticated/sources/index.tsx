import { createFileRoute } from '@tanstack/react-router'
import { SourcesPage } from '@/features/airadar/pages'

export const Route = createFileRoute('/_authenticated/sources/')({
  component: SourcesPage,
})
