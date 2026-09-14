import type { Content, Source, SourceType } from '@airadar/domain'

export interface DiscoveryRequest {
  source: Source
  cursor?: string
  limit: number
}

export interface DiscoveredItem {
  externalId: string
  content: Omit<Content, 'id'>
  publishedAt?: string
}

export interface DiscoveryBatch {
  items: DiscoveredItem[]
  nextCursor?: string
}

export interface SourceAdapter {
  providerId: string
  sourceType: SourceType
  discover(request: DiscoveryRequest): Promise<DiscoveryBatch>
}

export function defineSourceAdapter(adapter: SourceAdapter): SourceAdapter {
  return {
    ...adapter,
    async discover(request) {
      if (request.source.type !== adapter.sourceType) {
        throw new Error(
          `Provider ${adapter.providerId} does not support source type ${request.source.type}`
        )
      }
      return adapter.discover(request)
    },
  }
}
