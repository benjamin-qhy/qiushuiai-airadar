import {
  defineSourceAdapter,
  fetchJson,
  ProviderDiscoveryError,
  providerCursor,
  record,
  text,
  updateProviderCursor,
  type CaptureProviderResponse,
  type DiscoveredItem,
  type SourceAdapter,
  type VideoTranscriber,
} from './index.js'

function douyinId(value: string): string | undefined {
  return value.match(/\/video\/(\d+)/u)?.[1]
}

function getBijiHeaders(options: { apiKey: string; clientId: string }): {
  Authorization: string
  'X-Client-ID': string
} {
  return {
    Authorization: options.apiKey,
    'X-Client-ID': options.clientId,
  }
}

function assertGetBijiSuccess(
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (payload.success !== true) {
    const code = Number(payload.code)
    const message = [payload.code, payload.message, payload.msg]
      .map((value) => String(value ?? ''))
      .join(' ')
      .toLowerCase()
    const errorClass =
      code === 401 ||
      code === 403 ||
      /credential|unauthorized|forbidden|api.?key|token|鉴权|认证/u.test(
        message
      )
        ? 'credential'
        : code === 402 || /balance|余额|欠费/u.test(message)
          ? 'balance'
          : code === 429 || /rate|frequent|限流|频繁/u.test(message)
            ? 'rate-limit'
            : code === 400 ||
                code === 422 ||
                /parameter|invalid request|参数/u.test(message)
              ? 'invalid-request'
              : code >= 500 || /timeout|temporary|system|系统/u.test(message)
                ? 'temporary'
                : 'invalid-response'
    throw new ProviderDiscoveryError(errorClass, 'GetBiji request failed')
  }
  return record(payload.data)
}

function publishedAt(value: unknown): string | undefined {
  const raw = text(value)
  if (!raw) return undefined
  const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function decodePage(value: string | undefined): {
  page: number
  offset: number
  seenIds: string[]
} {
  if (!value) return { page: 1, offset: 0, seenIds: [] }
  try {
    const parsed = JSON.parse(value) as {
      page?: unknown
      offset?: unknown
      seenIds?: unknown
    }
    if (
      typeof parsed.page === 'number' &&
      Number.isInteger(parsed.page) &&
      parsed.page >= 1 &&
      Array.isArray(parsed.seenIds) &&
      parsed.seenIds.every((id) => typeof id === 'string')
    ) {
      return { page: parsed.page, offset: 0, seenIds: parsed.seenIds }
    }
    if (
      typeof parsed.page === 'number' &&
      Number.isInteger(parsed.page) &&
      parsed.page >= 1 &&
      typeof parsed.offset === 'number' &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return { page: parsed.page, offset: parsed.offset, seenIds: [] }
    }
  } catch {
    // Older cursors stored only the page number.
  }
  const legacyPage = Number(value)
  return Number.isInteger(legacyPage) && legacyPage >= 1
    ? { page: legacyPage, offset: 0, seenIds: [] }
    : { page: 1, offset: 0, seenIds: [] }
}

export function createGetBijiDouyinProvider(options: {
  apiKey: string
  clientId: string
  topicId: string
  followId: string | number
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): SourceAdapter {
  const fetcher = options.fetch ?? fetch
  const baseUrl = options.baseUrl ?? 'https://openapi.biji.com'
  return defineSourceAdapter({
    providerId: 'getbiji-douyin',
    sourceType: 'douyin',
    async discover(request) {
      const position = decodePage(
        providerCursor(request.cursor, 'getbiji-douyin')
      )
      const url = new URL(
        '/open/api/v1/resource/knowledge/blogger/contents',
        baseUrl
      )
      url.search = new URLSearchParams({
        topic_id: options.topicId,
        follow_id: String(options.followId),
        page: String(position.page),
      }).toString()
      const payload = await fetchJson(
        fetcher,
        url,
        { headers: getBijiHeaders(options) },
        { providerId: 'getbiji-douyin', callback: options.captureResponse }
      )
      const data = assertGetBijiSuccess(payload)
      const capturedAt = new Date().toISOString()
      const contents = Array.isArray(data.contents) ? data.contents : []
      const alreadySeen = new Set(position.seenIds)
      const selected = contents
        .slice(position.offset)
        .filter((value) => {
          const post = record(value)
          const id = text(post.post_url)
            ? douyinId(text(post.post_url) as string)
            : undefined
          return id && !alreadySeen.has(id)
        })
        .slice(0, request.limit)
      const items = selected.flatMap((value): DiscoveredItem[] => {
        const post = record(value)
        const canonicalUrl = text(post.post_url)
        const id = canonicalUrl ? douyinId(canonicalUrl) : undefined
        const providerReference = text(post.post_id_alias)
        if (!id || !canonicalUrl || !providerReference) return []
        const description =
          text(post.post_subtitle) ?? text(post.post_summary) ?? ''
        return [
          {
            externalId: id,
            platformIdentity: `douyin:${id}`,
            description: description || undefined,
            publishedAt: publishedAt(
              post.post_publish_time ?? post.post_create_time
            ),
            content: {
              kind: 'video',
              canonicalUrl,
              title: text(post.post_title) ?? `抖音视频 ${id}`,
            },
            evidence: {
              carrier: 'platform-video',
              discoveryUrl: canonicalUrl,
              sourceText: description || undefined,
              transcriptStatus: 'missing',
            },
            video: { scope: 'normal', providerReference },
            interaction: {
              capturedAt,
              views: null,
              likes: null,
              comments: null,
              shares: null,
              saves: null,
            },
          },
        ]
      })
      if (!items.length) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          'GetBiji returned no Douyin contents'
        )
      }
      const seenIds = [
        ...position.seenIds,
        ...items.map(({ externalId }) => externalId),
      ]
      const remaining = contents.some((value, index) => {
        const post = record(value)
        const url = text(post.post_url)
        const id = url ? douyinId(url) : undefined
        return index >= position.offset && id && !seenIds.includes(id)
      })
      const next = remaining
        ? JSON.stringify({ page: position.page, seenIds })
        : data.has_more === true
          ? JSON.stringify({ page: position.page + 1, seenIds: [] })
          : undefined
      return {
        items,
        nextCursor: updateProviderCursor(
          request.cursor,
          'getbiji-douyin',
          next
        ),
      }
    },
  })
}

export function createGetBijiDouyinTranscriber(options: {
  apiKey: string
  clientId: string
  topicId: string
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): VideoTranscriber {
  const fetcher = options.fetch ?? fetch
  const baseUrl = options.baseUrl ?? 'https://openapi.biji.com'
  return {
    providerId: 'getbiji-douyin-transcript',
    async transcribe(input) {
      if (!input.providerReference) {
        throw new Error('GetBiji transcript requires a provider reference')
      }
      const url = new URL(
        '/open/api/v1/resource/knowledge/blogger/content/detail',
        baseUrl
      )
      url.search = new URLSearchParams({
        topic_id: options.topicId,
        post_id: input.providerReference,
      }).toString()
      const payload = await fetchJson(
        fetcher,
        url,
        { headers: getBijiHeaders(options) },
        {
          providerId: 'getbiji-douyin-transcript',
          callback: options.captureResponse,
        }
      )
      const data = assertGetBijiSuccess(payload)
      const transcript = text(data.post_media_text)
      if (!transcript) {
        throw new Error('GetBiji detail has no complete media transcript')
      }
      return transcript
    },
  }
}
