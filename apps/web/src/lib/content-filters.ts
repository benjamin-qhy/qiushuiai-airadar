import type { FeedItem } from '@/types'

function localDateKey(value: string | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? undefined
    : date.toLocaleDateString('en-CA')
}

export interface ContentFilters {
  query: string
  processStatus: string
  recommendation: string
  read: string
  junk: string
  date: string
}

export function filterContentItems(
  items: FeedItem[],
  filters: ContentFilters
): FeedItem[] {
  const query = filters.query.trim().toLowerCase()
  return items.filter(
    (item) =>
      (!query ||
        `${item.title} ${item.summary} ${item.source?.name ?? ''}`
          .toLowerCase()
          .includes(query)) &&
      (filters.processStatus === 'all' ||
        (filters.processStatus === 'original-unavailable'
          ? item.originalStatus === 'deleted' ||
            item.originalStatus === 'private'
          : item.processStatus === filters.processStatus)) &&
      (filters.recommendation === 'all' ||
        item.recommendation === filters.recommendation) &&
      (filters.read === 'all' || item.read === (filters.read === 'read')) &&
      (filters.junk === 'all' ||
        item.junk.isJunk === (filters.junk === 'junk')) &&
      (!filters.date || localDateKey(item.firstInflowAt) === filters.date)
  )
}
