import { createFileRoute } from '@tanstack/react-router'
import { DailyFeedPage } from '@/features/airadar/pages'

export const Route = createFileRoute('/_authenticated/')({
  component: DailyFeedPage,
})
