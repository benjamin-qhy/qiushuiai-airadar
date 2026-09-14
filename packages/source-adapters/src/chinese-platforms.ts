import {
  array,
  assertTikHubSuccess,
  defineSourceAdapter,
  fetchJson,
  numberOrNull,
  ProviderDiscoveryError,
  providerCursor,
  record,
  text,
  titleFrom,
  updateProviderCursor,
  type CaptureProviderResponse,
  type DiscoveredItem,
  type InteractionSnapshot,
  type ImagePostDetailProvider,
  type SourceAdapter,
} from './index.js'

function epochIso(value: unknown): string | undefined {
  const parsed = numberOrNull(value)
  if (parsed === null) return undefined
  const milliseconds = parsed < 10_000_000_000 ? parsed * 1_000 : parsed
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function millisecondsToSeconds(value: unknown): number | undefined {
  const parsed = numberOrNull(value)
  if (parsed === null || parsed < 0) return undefined
  return parsed / 1_000
}

function seconds(value: unknown): number | undefined {
  const parsed = numberOrNull(value)
  return parsed === null || parsed < 0 ? undefined : parsed
}

function firstUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    const direct = text(value)
    if (direct?.startsWith('http')) return direct
    for (const candidate of array(value)) {
      const nested = text(candidate)
      if (nested?.startsWith('http')) return nested
    }
  }
  return undefined
}

function decodeOffsetCursor(value: string | undefined): {
  anchor: string
  offset: number
  seenIds: string[]
} {
  if (!value) return { anchor: '', offset: 0, seenIds: [] }
  try {
    const parsed = JSON.parse(value) as {
      anchor?: unknown
      offset?: unknown
      seenIds?: unknown
    }
    if (
      typeof parsed.anchor === 'string' &&
      Array.isArray(parsed.seenIds) &&
      parsed.seenIds.every((id) => typeof id === 'string')
    ) {
      return { anchor: parsed.anchor, offset: 0, seenIds: parsed.seenIds }
    }
    if (
      typeof parsed.anchor === 'string' &&
      typeof parsed.offset === 'number' &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return { anchor: parsed.anchor, offset: parsed.offset, seenIds: [] }
    }
  } catch {
    // Older cursors stored the provider anchor directly.
  }
  return { anchor: value, offset: 0, seenIds: [] }
}

function encodeStableCursor(anchor: string, seenIds: string[]): string {
  return JSON.stringify({ anchor, seenIds })
}

function interaction(
  capturedAt: string,
  values: {
    views?: unknown
    likes?: unknown
    comments?: unknown
    shares?: unknown
    saves?: unknown
  }
): InteractionSnapshot {
  return {
    capturedAt,
    views: numberOrNull(values.views),
    likes: numberOrNull(values.likes),
    comments: numberOrNull(values.comments),
    shares: numberOrNull(values.shares),
    saves: numberOrNull(values.saves),
  }
}

function tikhubOptions(options: {
  token: string
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): {
  fetcher: typeof fetch
  baseUrl: string
  headers: { Authorization: string }
} {
  return {
    fetcher: options.fetch ?? fetch,
    baseUrl: options.baseUrl ?? 'https://api.tikhub.io',
    headers: { Authorization: `Bearer ${options.token}` },
  }
}

export function createTikHubDouyinProvider(options: {
  token: string
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): SourceAdapter {
  const common = tikhubOptions(options)
  return defineSourceAdapter({
    providerId: 'tikhub-douyin',
    sourceType: 'douyin',
    async discover(request) {
      const url = new URL(
        '/api/v1/douyin/app/v3/fetch_user_post_videos',
        common.baseUrl
      )
      url.search = new URLSearchParams({
        sec_user_id: request.source.externalIdentity,
        max_cursor: providerCursor(request.cursor, 'tikhub-douyin') ?? '0',
        count: String(Math.min(20, request.limit)),
        sort_type: '0',
        channel: 'normal',
      }).toString()
      const payload = await fetchJson(
        common.fetcher,
        url,
        { headers: common.headers },
        { providerId: 'tikhub-douyin', callback: options.captureResponse }
      )
      assertTikHubSuccess(payload)
      const data = record(payload.data)
      const values = array(data.aweme_list)
      if (!values.length) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          'TikHub Douyin response has no aweme list'
        )
      }
      const capturedAt = new Date().toISOString()
      const items = values
        .slice(0, request.limit)
        .map((value): DiscoveredItem | undefined => {
          const item = record(value)
          const id = text(item.aweme_id)
          if (!id) return undefined
          const stats = record(item.statistics)
          const video = record(item.video)
          const play = record(video.play_addr)
          const description = text(item.desc) ?? text(item.caption) ?? ''
          return {
            externalId: id,
            platformIdentity: `douyin:${id}`,
            description: description || undefined,
            publishedAt: epochIso(item.create_time),
            content: {
              kind: 'video',
              canonicalUrl:
                text(item.share_url) ?? `https://www.douyin.com/video/${id}`,
              title: titleFrom(description, `抖音视频 ${id}`),
            },
            evidence: {
              carrier: 'platform-video',
              discoveryUrl:
                text(item.share_url) ?? `https://www.douyin.com/video/${id}`,
              sourceText: description || undefined,
              transcriptStatus: 'missing',
            },
            video: {
              scope: 'normal',
              durationSeconds: millisecondsToSeconds(
                video.duration ?? item.duration
              ),
              mediaUrl: firstUrl(
                play.url_list,
                record(video.download_addr).url_list
              ),
            },
            interaction: interaction(capturedAt, {
              views: stats.play_count,
              likes: stats.digg_count,
              comments: stats.comment_count,
              shares: stats.share_count,
              saves: stats.collect_count,
            }),
          }
        })
        .filter((item): item is DiscoveredItem => Boolean(item))
      if (!items.length) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          'TikHub Douyin response has no stable content ids'
        )
      }
      const next = data.has_more
        ? (text(data.max_cursor) ?? String(numberOrNull(data.max_cursor) ?? ''))
        : undefined
      return {
        items,
        nextCursor: updateProviderCursor(
          request.cursor,
          'tikhub-douyin',
          next || undefined
        ),
      }
    },
  })
}

export function createTikHubWechatChannelsProvider(options: {
  token: string
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): SourceAdapter {
  const common = tikhubOptions(options)
  return defineSourceAdapter({
    providerId: 'tikhub-wechat-channels',
    sourceType: 'wechat_channels',
    async discover(request) {
      const url = new URL(
        '/api/v1/wechat_channels/v2/fetch_user_videos',
        common.baseUrl
      )
      const page = decodeOffsetCursor(
        providerCursor(request.cursor, 'tikhub-wechat-channels')
      )
      const payload = await fetchJson(
        common.fetcher,
        url,
        {
          method: 'POST',
          headers: { ...common.headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            username: request.source.externalIdentity,
            last_buffer: page.anchor,
            raw: false,
          }),
        },
        {
          providerId: 'tikhub-wechat-channels',
          callback: options.captureResponse,
        }
      )
      assertTikHubSuccess(payload)
      const data = record(payload.data)
      const values = array(data.videos)
      if (!values.length) {
        throw new ProviderDiscoveryError(
          'temporary',
          'TikHub WeChat Channels returned debug-only or empty data'
        )
      }
      const capturedAt = new Date().toISOString()
      const alreadySeen = new Set(page.seenIds)
      const selected = values
        .slice(page.offset)
        .filter((value) => {
          const id = text(record(value).id)
          return id && !alreadySeen.has(id)
        })
        .slice(0, request.limit)
      const items = selected
        .map((value): DiscoveredItem | undefined => {
          const item = record(value)
          const id = text(item.id)
          if (!id) return undefined
          const media = record(item.media)
          const description = text(item.description) ?? ''
          const canonicalUrl = `https://weixin.qq.com/sph/${encodeURIComponent(id)}`
          return {
            externalId: id,
            platformIdentity: `wechat_channels:${id}`,
            description: description || undefined,
            publishedAt: epochIso(item.create_time),
            content: {
              kind: 'video',
              canonicalUrl,
              title:
                text(item.title) ??
                text(item.short_title) ??
                titleFrom(description, `视频号视频 ${id}`),
            },
            evidence: {
              carrier: 'platform-video',
              discoveryUrl: canonicalUrl,
              sourceText: description || undefined,
              transcriptStatus: 'missing',
            },
            video: {
              scope: 'normal',
              durationSeconds: seconds(media.duration),
              mediaUrl: firstUrl(media.full_url, media.url),
              providerReference: request.source.externalIdentity,
            },
            interaction: interaction(capturedAt, {
              views: item.read_count,
              likes: item.like_count,
              comments: item.comment_count,
              shares: item.forward_count,
              saves: item.fav_count,
            }),
          }
        })
        .filter((item): item is DiscoveredItem => Boolean(item))
      if (!items.length) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          'TikHub WeChat Channels response has no string content ids'
        )
      }
      const seenIds = [
        ...page.seenIds,
        ...items.map(({ externalId }) => externalId),
      ]
      const remaining = values.some((value, index) => {
        const id = text(record(value).id)
        return index >= page.offset && id && !seenIds.includes(id)
      })
      const next = remaining
        ? encodeStableCursor(page.anchor, seenIds)
        : data.up_continue && text(data.last_buffer)
          ? encodeStableCursor(text(data.last_buffer) as string, [])
          : undefined
      return {
        items,
        nextCursor: updateProviderCursor(
          request.cursor,
          'tikhub-wechat-channels',
          next
        ),
      }
    },
  })
}

export async function fetchTikHubWechatChannelsMedia(options: {
  token: string
  username: string
  videoId: string
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): Promise<{ mediaUrl: string; decodeKey: string }> {
  const common = tikhubOptions(options)
  const url = new URL(
    '/api/v1/wechat_channels/v2/fetch_user_videos',
    common.baseUrl
  )
  const payload = await fetchJson(
    common.fetcher,
    url,
    {
      method: 'POST',
      headers: { ...common.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: options.username,
        last_buffer: '',
        raw: false,
      }),
    },
    {
      providerId: 'tikhub-wechat-channels-media',
      callback: options.captureResponse,
    }
  )
  assertTikHubSuccess(payload)
  const videos = array(record(payload.data).videos)
  if (!videos.length) {
    throw new ProviderDiscoveryError(
      'temporary',
      'TikHub WeChat Channels returned debug-only or empty media data'
    )
  }
  const item = videos
    .map(record)
    .find((candidate) => text(candidate.id) === options.videoId)
  const media = record(item?.media)
  const mediaUrl = firstUrl(media.full_url, media.url)
  const numericDecodeKey = numberOrNull(media.decode_key)
  const decodeKey =
    text(media.decode_key) ??
    (numericDecodeKey === null ? undefined : String(numericDecodeKey))
  if (!mediaUrl || !decodeKey) {
    throw new ProviderDiscoveryError(
      'invalid-response',
      `TikHub WeChat Channels media is incomplete for ${options.videoId}`
    )
  }
  return { mediaUrl, decodeKey }
}

function xiaohongshuVideoUrl(value: unknown): string | undefined {
  const video = record(value)
  const media = record(video.media)
  return firstUrl(
    video.url,
    video.master_url,
    media.stream,
    media.url,
    record(video.video).url
  )
}

export function createTikHubXiaohongshuProvider(options: {
  token: string
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): SourceAdapter {
  const common = tikhubOptions(options)
  return defineSourceAdapter({
    providerId: 'tikhub-xiaohongshu',
    sourceType: 'xiaohongshu',
    async discover(request) {
      const url = new URL(
        '/api/v1/xiaohongshu/app_v2/get_user_posted_notes',
        common.baseUrl
      )
      url.searchParams.set('user_id', request.source.externalIdentity)
      const page = decodeOffsetCursor(
        providerCursor(request.cursor, 'tikhub-xiaohongshu')
      )
      if (page.anchor) url.searchParams.set('cursor', page.anchor)
      const payload = await fetchJson(
        common.fetcher,
        url,
        { headers: common.headers },
        { providerId: 'tikhub-xiaohongshu', callback: options.captureResponse }
      )
      assertTikHubSuccess(payload)
      const envelope = record(payload.data)
      if (envelope.success !== true || numberOrNull(envelope.code) !== 0) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          'TikHub Xiaohongshu returned an upstream service error'
        )
      }
      const data = record(envelope.data)
      const values = array(data.notes)
      if (!values.length) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          'TikHub Xiaohongshu response has no notes'
        )
      }
      const alreadySeen = new Set(page.seenIds)
      const selected = values
        .slice(page.offset)
        .filter((value) => {
          const note = record(value)
          const id = text(note.id) ?? text(note.note_id)
          return id && !alreadySeen.has(id)
        })
        .slice(0, request.limit)
      const capturedAt = new Date().toISOString()
      const items = selected
        .map((value): DiscoveredItem | undefined => {
          const note = record(value)
          const id = text(note.id) ?? text(note.note_id)
          const noteType = text(note.type)
          if (!id || (noteType !== 'normal' && noteType !== 'video')) {
            return undefined
          }
          const description = text(note.desc) ?? ''
          const canonicalUrl = `https://www.xiaohongshu.com/explore/${id}`
          const imageEntries = array(note.images_list)
          const images = imageEntries.map((image, order) => {
            const entry = record(image)
            const url = firstUrl(
              entry.original,
              entry.url_size_large,
              entry.url
            )
            return { order, url: url ?? '' }
          })
          return {
            externalId: id,
            platformIdentity: `xiaohongshu:${id}`,
            description: description || undefined,
            publishedAt: epochIso(note.create_time ?? note.timestamp),
            content: {
              kind: noteType === 'normal' ? 'image_post' : 'video',
              canonicalUrl,
              title:
                text(note.title) ??
                text(note.display_title) ??
                titleFrom(description, `小红书笔记 ${id}`),
            },
            evidence: {
              carrier:
                noteType === 'normal'
                  ? 'platform-image-post'
                  : 'platform-video',
              discoveryUrl: canonicalUrl,
              sourceText: description || undefined,
              transcriptStatus: noteType === 'video' ? 'missing' : undefined,
            },
            images: noteType === 'normal' ? images : undefined,
            video:
              noteType === 'video'
                ? {
                    scope: 'normal',
                    mediaUrl: xiaohongshuVideoUrl(note.video_info_v2),
                  }
                : undefined,
            interaction: interaction(capturedAt, {
              views: note.view_count,
              likes: note.liked_count ?? note.likes,
              comments: note.comments_count,
              shares: note.shared_count ?? note.share_count,
              saves: note.collected_count,
            }),
          }
        })
        .filter((item): item is DiscoveredItem => Boolean(item))
      if (!items.length) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          'TikHub Xiaohongshu response has no supported notes'
        )
      }
      const seenIds = [
        ...page.seenIds,
        ...items.map(({ externalId }) => externalId),
      ]
      const remaining = values.some((value, index) => {
        const note = record(value)
        const id = text(note.id) ?? text(note.note_id)
        return index >= page.offset && id && !seenIds.includes(id)
      })
      const lastNote = record(values.at(-1))
      const providerNext = text(lastNote.cursor) ?? text(lastNote.id)
      const next = remaining
        ? encodeStableCursor(page.anchor, seenIds)
        : data.has_more && providerNext
          ? encodeStableCursor(providerNext, [])
          : undefined
      return {
        items,
        nextCursor: updateProviderCursor(
          request.cursor,
          'tikhub-xiaohongshu',
          next
        ),
      }
    },
  })
}

export function createTikHubXiaohongshuDetailProvider(options: {
  token: string
  fetch?: typeof fetch
  baseUrl?: string
  captureResponse?: CaptureProviderResponse
}): ImagePostDetailProvider {
  const common = tikhubOptions(options)
  return {
    providerId: 'tikhub-xiaohongshu-detail',
    async fetchDetail(input) {
      const noteId = input.contentId.startsWith('xiaohongshu:')
        ? input.contentId.slice('xiaohongshu:'.length)
        : undefined
      if (!noteId) throw new Error('Xiaohongshu content id is invalid')
      const url = new URL(
        '/api/v1/xiaohongshu/app_v2/get_image_note_detail',
        common.baseUrl
      )
      url.searchParams.set('note_id', noteId)
      const payload = await fetchJson(
        common.fetcher,
        url,
        { headers: common.headers },
        {
          providerId: 'tikhub-xiaohongshu-detail',
          callback: options.captureResponse,
        }
      )
      assertTikHubSuccess(payload)
      const envelope = record(payload.data)
      const detailData = array(envelope.data)[0]
      const note = record(array(record(detailData).note_list)[0])
      const sourceText = text(note.desc) ?? ''
      const imageEntries = array(note.images_list)
      const images = imageEntries.map((image, order) => {
        const entry = record(image)
        return {
          order,
          url: firstUrl(entry.original, entry.url_size_large, entry.url) ?? '',
        }
      })
      if (
        envelope.success !== true ||
        numberOrNull(envelope.code) !== 0 ||
        text(note.id ?? note.note_id) !== noteId ||
        !sourceText ||
        !images.length ||
        images.some((image) => !image.url)
      ) {
        throw new ProviderDiscoveryError(
          'invalid-response',
          `TikHub Xiaohongshu detail is incomplete for ${noteId}`
        )
      }
      return { sourceText, images }
    },
  }
}
