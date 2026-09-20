import { useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { ConfigPage } from '@/features/config-page'
import { ContentWorkspace } from '@/features/content-workspace'
import { ModelManagementPage } from '@/features/model-management-page'
import { RuntimePage } from '@/features/runtime-page'
import { RuntimeLogPage } from '@/features/runtime-log-page'
import { SourcesPage } from '@/features/sources-page'
import type { PageKey } from '@/types'

export { ContentCard } from '@/features/content-workspace'
export type { FeedItem } from '@/types'

export function App() {
  const [page, setPage] = useState<PageKey>('daily')
  return (
    <AppShell page={page} onPage={setPage}>
      {page === 'daily' ? (
        <ContentWorkspace scope='daily' />
      ) : page === 'all' ? (
        <ContentWorkspace scope='all' />
      ) : page === 'exceptions' ? (
        <ContentWorkspace scope='exceptions' />
      ) : page === 'favorites' ? (
        <ContentWorkspace scope='favorites' />
      ) : page === 'junk' ? (
        <ContentWorkspace scope='junk' />
      ) : page === 'sources' ? (
        <SourcesPage />
      ) : page === 'models' ? (
        <ModelManagementPage />
      ) : page === 'runtime' ? (
        <RuntimePage />
      ) : page === 'runtime-log' ? (
        <RuntimeLogPage />
      ) : (
        <ConfigPage />
      )}
    </AppShell>
  )
}
