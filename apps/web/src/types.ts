export type PageKey =
  'daily' | 'all' | 'junk' | 'sources' | 'runtime' | 'config'
export type UtilizationAction =
  'favorite' | 'card' | 'video' | 'article' | 'project'

export interface FeedItem {
  id: string
  title: string
  url?: string
  publishedAt?: string
  discoveredAt?: string
  firstInflowAt?: string
  body: string
  summary: string
  originalLanguage?: 'zh' | 'en' | 'unknown'
  chineseTranslation?: string
  translatedToChinese?: boolean
  topics: string[]
  scores: Record<string, unknown>
  totalScore: number
  recommendation: 'core' | 'explore' | 'none'
  kind?: 'short_post' | 'video' | 'image_post' | 'article'
  source?: { id: string; name: string; type: string }
  images?: Array<{ order?: number; url: string }>
  video?: {
    durationSeconds?: number
    thumbnailUrl?: string
    mediaUrl?: string
  }
  processStatus:
    'processing' | 'completed' | 'failed' | 'waiting-manual-transcription'
  originalStatus?: unknown
  read: boolean
  utilizationActions: UtilizationAction[]
  junk: {
    isJunk: boolean
    source: 'ai' | 'manual' | 'none'
    reason?: string
    note?: string
  }
  evidence?: unknown
  interaction?: {
    capturedAt: string
    views: number | null
    likes: number | null
    comments: number | null
    shares: number | null
    saves: number | null
  }
  analysis?: {
    provider: string
    model: string
    profileVersionId: string
    ruleVersion: string
  }
}

export interface SourceItem {
  id: string
  name: string
  type: string
  externalIdentity: string
  status: 'enabled' | 'disabled' | 'archived'
  health: 'healthy' | 'warning' | 'unavailable' | 'disabled'
  tags?: string[]
  notes?: string
  effectiveParameters: { ids: string[]; values: Record<string, unknown> }
  latestAudit?: {
    discovered: number
    succeeded: number
    failed: number
    finishedAt: string
  }
}

export interface ProviderItem {
  id: string
  name: string
  sourceType: string
  priority: number
  health: { state: string; reason?: string }
  secretStatus?: { configured: boolean; maskedValue?: string }
}
