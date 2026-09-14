import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/features/airadar/pages'

export const Route = createFileRoute('/_authenticated/configuration/')({
  component: SettingsPage,
})
