import {
  contentIdentity,
  type ContentInteraction,
  type LogEvent,
  type OriginalContent,
  type SingleTableRepository,
  type ScoringRules,
} from '@airadar/runtime'

import {
  processSingleTableContent,
  type SingleTableModelGateway,
} from './single-table-flow.js'

export interface ConfiguredSource {
  id: string
  platform: string
  account_name: string
  external_identity: string
  language: 'zh' | 'en'
  enabled: boolean
  per_source_limit?: number
}

export interface DiscoveredContent {
  externalId: string
  url?: string
  title?: string
  publishedAt?: string
  body?: string
  kind: OriginalContent['kind']
  format?: OriginalContent['format']
  interaction?: ContentInteraction
  opaque?: unknown
}

export interface SinglePageDiscovery {
  items: DiscoveredContent[]
  providerId?: string
  request: unknown
  response: unknown
}

export interface ResolvedContent {
  original: OriginalContent
  calls?: LogEvent[]
}

export interface SingleTableSourceProvider {
  // One call per source. There is deliberately no cursor or next-page API.
  discover(
    source: ConfiguredSource,
    limit: number
  ): Promise<SinglePageDiscovery>
  resolve(
    source: ConfiguredSource,
    item: DiscoveredContent
  ): Promise<ResolvedContent>
}

export interface CollectSourcesOptions {
  sources: ConfiguredSource[]
  provider: SingleTableSourceProvider
  repository: SingleTableRepository
  gateway: SingleTableModelGateway
  promptsRoot: string
  profile: { interests: string[]; goals: string[]; exclusions: string[] }
  profileVersion?: string
  scoring: ScoringRules
  longContentMinChars: number
  translationMinimumTotalScore: number
  perSourceLimit: number
  onError?: (
    source: ConfiguredSource,
    item: DiscoveredContent | undefined,
    error: unknown
  ) => void
  afterSource?: (
    source: ConfiguredSource,
    result: SourceRunResult,
    page: SinglePageDiscovery
  ) => Promise<void>
}

export interface SourceRunResult {
  sourceId: string
  discovered: number
  completed: number
  failed: number
  skipped: number
}

export async function collectSourcesSerially(
  options: CollectSourcesOptions
): Promise<SourceRunResult[]> {
  const results: SourceRunResult[] = []
  for (const source of options.sources) {
    if (!source.enabled) continue
    const sourceLimit = source.per_source_limit ?? options.perSourceLimit
    const result = {
      sourceId: source.id,
      discovered: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    }
    results.push(result)
    let page: SinglePageDiscovery
    try {
      page = await options.provider.discover(source, sourceLimit)
    } catch (error) {
      result.failed++
      options.onError?.(source, undefined, error)
      continue
    }
    result.discovered = Math.min(page.items.length, sourceLimit)
    for (const item of page.items.slice(0, sourceLimit)) {
      let original: OriginalContent | undefined
      try {
        const resolved = await options.provider.resolve(source, item)
        original = resolved.original
        if (!resolved.original.body.trim())
          throw new Error('Resolved content has no body')
        const existing = options.repository.get(
          contentIdentity(resolved.original).key
        )
        if (existing) {
          // Existing failures require an explicit manual retry; a new list
          // fetch must never silently repair or reprocess them.
          if (existing.process_status === 'completed') result.completed++
          else result.skipped++
          continue
        }
        await processSingleTableContent({
          repository: options.repository,
          gateway: options.gateway,
          promptsRoot: options.promptsRoot,
          original: resolved.original,
          profile: options.profile,
          profileVersion: options.profileVersion,
          scoring: options.scoring,
          longContentMinChars: options.longContentMinChars,
          translationMinimumTotalScore: options.translationMinimumTotalScore,
          capturedCalls: [
            {
              action: 'discover',
              stage: 'discovered',
              status: 'succeeded',
              request: page.request,
              response: page.response,
            },
            ...(resolved.calls ?? []),
          ],
        })
        result.completed++
      } catch (error) {
        result.failed++
        try {
          if (
            original &&
            options.repository.get(contentIdentity(original).key)
          ) {
            options.onError?.(source, item, error)
            continue
          }
          await options.repository.recordUnavailable(
            {
              platform: source.platform,
              sourceType: source.platform,
              sourceAccountId: source.id,
              sourceAccountName: source.account_name
                .replace(/^(?:X|YouTube)\s*\/\s*/iu, '')
                .trim(),
              externalContentId: item.externalId,
              canonicalUrl: item.url,
              title: item.title ?? item.externalId,
              originalTitle:
                item.kind === 'short_post' ? undefined : item.title,
              kind: item.kind,
              format: item.format ?? 'plain_text',
              language: source.language,
              publishedAt: item.publishedAt,
            },
            error instanceof Error ? error.message : String(error),
            item.kind === 'video' &&
              /captions|transcription/iu.test(String(error)),
            { request: page.request, response: page.response }
          )
        } catch (recordError) {
          options.onError?.(source, item, recordError)
        }
        options.onError?.(source, item, error)
      } finally {
        if (item.interaction)
          options.repository.updateInteractionBySourceId(
            source.id,
            item.externalId,
            item.interaction
          )
      }
    }
    if (options.afterSource) await options.afterSource(source, result, page)
  }
  return results
}
