import { useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { ConfigPage } from '@/features/config-page'
import { ContentWorkspace } from '@/features/content-workspace'
import { RuntimePage } from '@/features/runtime-page'
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
      ) : page === 'junk' ? (
        <ContentWorkspace scope='junk' />
      ) : page === 'sources' ? (
        <SourcesPage />
      ) : page === 'runtime' ? (
        <RuntimePage />
      ) : (
        <ConfigPage />
      )}
    </AppShell>
  )
}
