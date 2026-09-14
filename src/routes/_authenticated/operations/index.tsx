import { createFileRoute } from '@tanstack/react-router'
import { OperationsPage } from '@/features/airadar/pages'

export const Route = createFileRoute('/_authenticated/operations/')({
  component: OperationsPage,
})
