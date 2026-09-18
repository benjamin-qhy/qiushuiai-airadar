import {
  enrichArticle,
  RssAdapter,
  type ConfiguredSource,
  type DiscoveredContent,
  type SingleTableSourceProvider,
} from '@airadar/pipeline'
import {
  createTikHubXProvider,
  createTikHubYouTubeProvider,
  createTikHubYouTubeTranscriptProvider,
  createTwitterApiIoProvider,
  createYouTubeDataApiProvider,
  fetchTwitterApiIoArticle,
  isXArticleUrl,
  type DiscoveredItem,
  type SourceAdapter,
} from '@airadar/source-adapters'
import type { LogEvent } from '@airadar/runtime'

interface ProviderOptions {
  tikHubToken?: string
  twitterApiKey?: string
  youtubeApiKey?: string
  fetch?: typeof fetch
}

function auditFetch(
  fetcher: typeof fetch,
  calls: Array<{ request: unknown; response: unknown }>
): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const method = init?.method ?? request?.method ?? 'GET'
    const url = String(request?.url ?? input)
    const body = init?.body
      ? String(init.body)
      : request?.body
        ? await request.clone().text()
        : undefined
    const headers = Object.fromEntries(
      new Headers(init?.headers ?? request?.headers).entries()
    )
    try {
      const response = await fetcher(input, init)
      const responseBody = await response.clone().text()
      calls.push({
        request: { method, url, headers, body },
        response: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        },
      })
      return response
    } catch (error) {
      calls.push({
        request: { method, url, headers, body },
        response: {
          received: false,
          errorType: error instanceof Error ? error.name : 'unknown',
        },
      })
      throw error
    }
  }
}

function toLogEvents(
  calls: Array<{ request: unknown; response: unknown }>,
  action: string
): LogEvent[] {
  return calls.map(({ request, response }) => ({
    action,
    stage: action === 'discover' ? 'discovered' : 'enriching',
    status: 'succeeded',
    request,
    response,
  }))
}

function accountName(source: ConfiguredSource): string {
  return source.account_name.replace(/^(?:X|YouTube)\s*\/\s*/iu, '').trim()
}

export function createSingleTableSourceProvider(
  options: ProviderOptions
): SingleTableSourceProvider {
  const fetcher = options.fetch ?? fetch
  const discovered = new Map<string, DiscoveredItem>()
  return {
    async discover(source, limit) {
      const calls: Array<{ request: unknown; response: unknown }> = []
      const trackedFetch = auditFetch(fetcher, calls)
      if (source.platform === 'rss') {
        const batch = await new RssAdapter(trackedFetch).discover({
          feedUrl: source.external_identity,
          limit,
        })
        return {
          providerId: 'native-rss',
          items: batch.items.map((item) => ({
            externalId: item.externalId,
            url: item.canonicalUrl,
            title: item.title,
            publishedAt: item.publishedAt,
            kind: 'article' as const,
            format: 'plain_text' as const,
          })),
          request: calls.map((call) => call.request),
          response: calls.map((call) => call.response),
        }
      }
      let adapter: SourceAdapter
      if (source.platform === 'x') {
        if (options.twitterApiKey)
          adapter = createTwitterApiIoProvider({
            apiKey: options.twitterApiKey,
            fetch: trackedFetch,
          })
        else if (options.tikHubToken)
          adapter = createTikHubXProvider({
            token: options.tikHubToken,
            fetch: trackedFetch,
          })
        else throw new Error('X provider credential is not configured')
      } else if (source.platform === 'youtube') {
        if (options.youtubeApiKey)
          adapter = createYouTubeDataApiProvider({
            apiKey: options.youtubeApiKey,
            fetch: trackedFetch,
          })
        else if (options.tikHubToken) {
          const channelUrl = new URL(source.external_identity)
          const response = await trackedFetch(channelUrl, {
            signal: AbortSignal.timeout(10_000),
          })
          if (!response.ok)
            throw new Error(`YouTube channel lookup failed: ${response.status}`)
          const html = await response.text()
          const channelId =
            html.match(/"channelId":"(UC[A-Za-z0-9_-]+)"/u)?.[1] ??
            html.match(
              /itemprop="channelId" content="(UC[A-Za-z0-9_-]+)"/u
            )?.[1]
          if (!channelId) throw new Error('YouTube channel ID was not found')
          adapter = createTikHubYouTubeProvider({
            token: options.tikHubToken,
            channelId,
            fetch: trackedFetch,
          })
        } else throw new Error('YouTube provider credential is not configured')
      } else throw new Error(`No single-table provider for ${source.platform}`)

      const batch = await adapter.discover({
        source: {
          id: source.id,
          slug: source.id,
          name: source.account_name,
          type: source.platform as 'x' | 'youtube',
          language: source.language,
          externalIdentity: source.external_identity,
          status: 'enabled',
        },
        limit,
        // Deliberately no cursor, even when the adapter returns nextCursor.
      })
      const items: DiscoveredContent[] = batch.items.map((item) => {
        discovered.set(`${source.id}:${item.externalId}`, item)
        return {
          externalId: item.externalId,
          url: item.content.canonicalUrl,
          title: item.content.title,
          publishedAt: item.publishedAt,
          body: item.description,
          kind: item.content.kind,
          format: item.content.kind === 'article' ? 'plain_text' : 'plain_text',
        }
      })
      return {
        providerId: adapter.providerId,
        items,
        request: calls.map((call) => call.request),
        response: calls.map((call) => call.response),
      }
    },
    async resolve(source: ConfiguredSource, item: DiscoveredContent) {
      const calls: Array<{ request: unknown; response: unknown }> = []
      const trackedFetch = auditFetch(fetcher, calls)
      const sourceItem = discovered.get(`${source.id}:${item.externalId}`)
      let body = item.body?.trim() ?? ''
      let title = item.title ?? ''
      let url = item.url
      let format: 'plain_text' | 'subtitle' = 'plain_text'
      if (item.kind === 'article') {
        if (!url) throw new Error('Article URL is missing')
        const article =
          source.platform === 'x' && isXArticleUrl(url) && options.twitterApiKey
            ? await fetchTwitterApiIoArticle({
                apiKey: options.twitterApiKey,
                tweetId: item.externalId,
                canonicalUrl: url,
                fetch: trackedFetch,
              })
            : await enrichArticle(url, trackedFetch)
        body = article.body
        title = article.title
        url = article.canonicalUrl
      } else if (item.kind === 'video') {
        if (source.platform !== 'youtube' || !options.tikHubToken)
          throw new Error('Video captions provider is unavailable')
        const captions = await createTikHubYouTubeTranscriptProvider({
          token: options.tikHubToken,
          fetch: trackedFetch,
        }).fetchTranscript(item.externalId)
        if (captions.status !== 'available' || !captions.text?.trim())
          throw new Error(
            `Video captions are ${captions.status}; manual transcription required`
          )
        body = captions.text
        format = 'subtitle'
      } else if (sourceItem?.thread) {
        if (!sourceItem.thread.complete)
          throw new Error('X thread is incomplete')
        body =
          sourceItem.thread.parts
            .map((part) => part.text.trim())
            .filter(Boolean)
            .join('\n\n') || body
      }
      if (!body) throw new Error('No complete original content')
      return {
        original: {
          platform: source.platform,
          sourceType: source.platform,
          sourceAccountId: source.id,
          sourceAccountName: accountName(source),
          externalContentId: item.externalId,
          canonicalUrl: url,
          title: title || body.slice(0, 80),
          originalTitle:
            item.kind === 'short_post' ? undefined : title || undefined,
          body,
          explicitLong: Boolean(sourceItem?.thread && sourceItem.thread.parts.length > 1),
          kind: item.kind,
          format,
          language: source.language,
          publishedAt: item.publishedAt,
        },
        calls: toLogEvents(calls, 'enrich'),
      }
    },
  }
}
