import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it } from 'vitest'

import { RuntimeRepository } from '@airadar/runtime'

import {
  calculateRecommendation,
  canonicalizeArticleUrl,
  createPiModelGateway,
  createReadOnlyCodexCredentialStore,
  enrichArticle,
  enrichYouTubeContent,
  RssAdapter,
  runPlatformDiscovery,
  runRssPipeline,
  analyzeStoredContent,
} from './index.js'

const roots: string[] = []

async function repository(): Promise<RuntimeRepository> {
  const root = await mkdtemp(path.join(tmpdir(), 'airadar-pipeline-'))
  roots.push(root)
  return RuntimeRepository.open(root)
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true }))
  )
})

describe('X and YouTube discovery gate', () => {
  it('clears a persisted provider cursor after reaching the last page', async () => {
    const runtime = await repository()
    await runtime.advanceProgress('x-last-page', 'old-page')
    await runPlatformDiscovery({
      repository: runtime,
      source: {
        id: 'x-last-page',
        slug: 'x-last-page',
        name: 'X last page',
        type: 'x',
        externalIdentity: 'example',
        status: 'enabled',
      },
      cursor: 'old-page',
      limit: 1,
      runner: {
        async discover() {
          return { providerId: 'provider-1', items: [] }
        },
      },
    })
    expect(runtime.getProgress('x-last-page')).toMatchObject({
      sourceId: 'x-last-page',
    })
    expect(runtime.getProgress('x-last-page')?.cursor).toBeUndefined()
    await runtime.close()
  })

  it('merges self-reply thread parts that arrive on later pages', async () => {
    const runtime = await repository()
    const source = {
      id: 'x-thread',
      slug: 'x-thread',
      name: 'X thread',
      type: 'x' as const,
      externalIdentity: 'example',
      status: 'enabled' as const,
    }
    let page = 0
    const runner = {
      async discover() {
        page += 1
        const isRoot = page === 2
        return {
          providerId: 'provider-1',
          nextCursor: isRoot ? undefined : 'page-2',
          items: [
            {
              externalId: isRoot ? 'root-1' : 'reply-1',
              platformIdentity: 'x:root-1',
              description: isRoot ? 'part one' : 'part two',
              content: {
                kind: 'short_post' as const,
                canonicalUrl: 'https://x.com/i/status/root-1',
                title: isRoot ? 'part one' : 'part two',
              },
              thread: {
                conversationId: 'root-1',
                complete: isRoot,
                parts: [
                  {
                    id: isRoot ? 'root-1' : 'reply-1',
                    text: isRoot ? 'part one' : 'part two',
                    publishedAt: isRoot
                      ? '2026-09-14T08:00:00.000Z'
                      : '2026-09-14T08:01:00.000Z',
                  },
                ],
              },
            },
          ],
        }
      },
    }
    await runPlatformDiscovery({
      repository: runtime,
      source,
      limit: 1,
      runner,
    })
    expect(runtime.getContent('x:root-1')).toMatchObject({
      body: '',
      enrichmentStatus: 'pending',
    })
    expect(runtime.indexedTaskCount()).toBe(0)
    await runPlatformDiscovery({
      repository: runtime,
      source,
      cursor: 'page-2',
      limit: 1,
      runner,
    })
    await runPlatformDiscovery({
      repository: runtime,
      source,
      limit: 1,
      runner: {
        async discover() {
          return {
            providerId: 'provider-1',
            items: [
              {
                externalId: 'retweet-1',
                platformIdentity: 'x:root-1',
                description: 'retweet carrier evidence',
                content: {
                  kind: 'short_post',
                  canonicalUrl: 'https://x.com/i/status/root-1',
                  title: 'Retweet evidence',
                },
              },
            ],
          }
        },
      },
    })
    expect(runtime.getContent('x:root-1')).toMatchObject({
      body: 'part one\n\npart two',
      threadParts: [
        { id: 'root-1', text: 'part one' },
        { id: 'reply-1', text: 'part two' },
      ],
    })
    expect(runtime.indexedContentCount()).toBe(1)
    expect(runtime.indexedDiscoveryCount()).toBe(3)
    await runtime.close()
  })

  it('persists every same-batch X discovery with matching evidence', async () => {
    const runtime = await repository()
    await runPlatformDiscovery({
      repository: runtime,
      source: {
        id: 'x-shared-video',
        slug: 'x-shared-video',
        name: 'X shared video',
        type: 'x',
        externalIdentity: 'example',
        status: 'enabled',
      },
      limit: 2,
      runner: {
        async discover() {
          return {
            providerId: 'provider-1',
            items: [
              {
                externalId: 'post-1',
                platformIdentity: 'youtube:dQw4w9WgXcQ',
                content: {
                  kind: 'video',
                  canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                  title: 'Shared video',
                },
                evidence: {
                  carrier: 'youtube',
                  discoveryUrl: 'https://x.com/i/status/post-1',
                },
                discoveryParts: ['post-1', 'post-2'].map((externalId) => ({
                  externalId,
                  discoveryUrl: `https://x.com/i/status/${externalId}`,
                  sourceText: `evidence ${externalId}`,
                  interaction: {
                    capturedAt: '2026-09-14T08:00:00.000Z',
                    views: externalId === 'post-1' ? 10 : 20,
                    likes: null,
                    comments: null,
                    shares: null,
                    saves: null,
                  },
                })),
              },
            ],
          }
        },
      },
    })
    const discoveries = runtime.listDiscoveries('x-shared-video')
    expect(discoveries).toHaveLength(2)
    for (const discovery of discoveries) {
      expect(discovery.evidence).toMatchObject({
        discoveryUrl: discovery.discoveryUrl,
        sourceText: discovery.sourceText,
      })
    }
    expect(
      runtime
        .listInteractionSnapshots('youtube:dQw4w9WgXcQ')
        .map((snapshot) => [snapshot.externalId, snapshot.views])
        .sort()
    ).toEqual([
      ['post-1', 10],
      ['post-2', 20],
    ])
    await runtime.close()
  })

  it('does not advance the cursor when a snapshot side effect fails', async () => {
    const runtime = await repository()
    runtime.saveInteractionSnapshot = async () => {
      throw new Error('forced snapshot failure')
    }
    await expect(
      runPlatformDiscovery({
        repository: runtime,
        source: {
          id: 'x-cursor',
          slug: 'x-cursor',
          name: 'X cursor',
          type: 'x',
          externalIdentity: 'example',
          status: 'enabled',
        },
        limit: 1,
        runner: {
          async discover() {
            return {
              providerId: 'provider-1',
              nextCursor: 'next-page',
              items: [
                {
                  externalId: 'short-1',
                  platformIdentity: 'x:short-1',
                  description: 'complete short',
                  content: {
                    kind: 'short_post',
                    canonicalUrl: 'https://x.com/i/status/short-1',
                    title: 'Short',
                  },
                  interaction: {
                    capturedAt: '2026-09-14T08:00:00.000Z',
                    views: 1,
                    likes: null,
                    comments: null,
                    shares: null,
                    saves: null,
                  },
                },
              ],
            }
          },
        },
      })
    ).rejects.toThrow('forced snapshot failure')
    expect(runtime.getProgress('x-cursor')).toBeUndefined()
    await runtime.close()
  })

  it('persists short/article/video evidence and blocks incomplete video analysis', async () => {
    const runtime = await repository()
    const source = {
      id: 'x-source',
      slug: 'x-source',
      name: 'X source',
      type: 'x' as const,
      externalIdentity: 'example',
      status: 'enabled' as const,
    }
    const interaction = {
      capturedAt: '2026-09-14T08:00:00.000Z',
      views: 10,
      likes: 2,
      comments: null,
      shares: null,
      saves: null,
    }
    const result = await runPlatformDiscovery({
      repository: runtime,
      source,
      limit: 10,
      runner: {
        async discover() {
          return {
            providerId: 'test-provider',
            items: [
              {
                externalId: 'short-1',
                platformIdentity: 'x:short-1',
                description: 'complete short text',
                content: {
                  kind: 'short_post',
                  canonicalUrl: 'https://x.com/i/status/short-1',
                  title: 'Short',
                },
                evidence: {
                  discoveryUrl: 'https://x.com/i/status/short-1',
                  carrier: 'x-short',
                  sourceText: 'complete short text',
                },
                interaction,
              },
              {
                externalId: 'article-1',
                platformIdentity: 'url:https://example.com/article',
                description: 'link context only',
                content: {
                  kind: 'article',
                  canonicalUrl: 'https://example.com/article',
                  title: 'Article',
                },
                evidence: {
                  discoveryUrl: 'https://x.com/i/status/article-1',
                  carrier: 'external-article',
                  sourceText: 'link context only',
                },
                interaction,
              },
              {
                externalId: 'video-1',
                platformIdentity: 'youtube:dQw4w9WgXcQ',
                content: {
                  kind: 'video',
                  canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                  title: 'Video',
                },
                evidence: {
                  discoveryUrl: 'https://x.com/i/status/video-1',
                  carrier: 'youtube',
                  transcriptStatus: 'missing',
                },
                video: { scope: 'normal', durationSeconds: 600 },
                interaction,
              },
            ],
          }
        },
      },
    })
    expect(result).toMatchObject({ analyzeReady: 1, blocked: 2 })
    expect(runtime.getContent('x:short-1')).toMatchObject({
      enrichmentStatus: 'succeeded',
      body: 'complete short text',
    })
    expect(runtime.getContent('url:https://example.com/article')).toMatchObject(
      { enrichmentStatus: 'pending', body: '' }
    )
    expect(runtime.getContent('youtube:dQw4w9WgXcQ')).toMatchObject({
      enrichmentStatus: 'waiting-manual-transcription',
      body: '',
    })

    await runPlatformDiscovery({
      repository: runtime,
      source: {
        id: 'youtube-source',
        slug: 'youtube-source',
        name: 'YouTube source',
        type: 'youtube',
        externalIdentity: '@example',
        status: 'enabled',
      },
      limit: 10,
      runner: {
        async discover() {
          return {
            providerId: 'youtube-data-api',
            items: [
              {
                externalId: 'dQw4w9WgXcQ',
                platformIdentity: 'youtube:dQw4w9WgXcQ',
                content: {
                  kind: 'video',
                  canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                  title: 'Authoritative YouTube title',
                },
                evidence: {
                  discoveryUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                  carrier: 'youtube',
                },
                video: { scope: 'normal', durationSeconds: 601 },
              },
            ],
          }
        },
      },
    })
    expect(runtime.getContent('youtube:dQw4w9WgXcQ')).toMatchObject({
      externalId: 'dQw4w9WgXcQ',
      title: 'Authoritative YouTube title',
      video: { scope: 'normal', durationSeconds: 601 },
    })
    await expect(
      runtime.saveAnalysis({
        id: 'forbidden-analysis',
        contentId: 'youtube:dQw4w9WgXcQ',
        fingerprint: 'f',
        version: 1,
        manual: false,
        provider: 'test',
        model: 'gpt-5.3-codex-spark',
        promptVersion: 'p1',
        profileVersionId: 'profile-1',
        ruleVersion: 'r1',
        createdAt: '2026-09-14T08:01:00.000Z',
        durationMs: 1,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
        },
        result: {},
      })
    ).rejects.toThrow('Only completely enriched content can be analyzed')
    let transcribedVideoId = ''
    await expect(
      enrichYouTubeContent({
        repository: runtime,
        contentId: 'youtube:dQw4w9WgXcQ',
        transcriptProvider: {
          providerId: 'caption-provider',
          async fetchTranscript() {
            return { status: 'missing' }
          },
        },
        autoTranscribe: true,
        transcriber: {
          providerId: 'speech-to-text',
          async transcribe(request) {
            transcribedVideoId = request.videoId
            return 'complete automatic transcription'
          },
        },
      })
    ).resolves.toEqual({ status: 'succeeded', providerId: 'speech-to-text' })
    expect(transcribedVideoId).toBe('dQw4w9WgXcQ')
    expect(runtime.getContent('youtube:dQw4w9WgXcQ')).toMatchObject({
      enrichmentStatus: 'succeeded',
      body: 'complete automatic transcription',
    })
    await runtime.close()
  })
})

const analysisArguments = {
  summary: '这是一篇完整且可执行的人工智能产品更新摘要。',
  topics: ['人工智能', '产品'],
  scores: {
    topicMatch: { level: 5, reason: '直接匹配关注方向' },
    substance: { level: 4, reason: '有具体事实' },
    credibility: { level: 4, reason: '来自官方来源' },
    novelty: { level: 4, reason: '包含新信息' },
    actionability: { level: 4, reason: '可以实际应用' },
    workValue: { level: 4, reason: '对工作有帮助' },
    clarity: { level: 4, reason: '表达清楚完整' },
  },
  spam: { isSpam: false },
}

function fauxGateway() {
  const models = createModels()
  const faux = fauxProvider()
  models.setProvider(faux.provider)
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('submit_analysis', analysisArguments)),
    fauxAssistantMessage(fauxToolCall('submit_analysis', analysisArguments)),
  ])
  return { gateway: createPiModelGateway(models, faux.getModel()), faux }
}

describe('RSS discovery and enrichment', () => {
  it('normalizes tracking variants to one article identity', () => {
    expect(
      canonicalizeArticleUrl(
        'HTTPS://OpenAI.com/news/example/?utm_source=rss&gclid=x#section'
      )
    ).toBe('https://openai.com/news/example')
  })

  it('discovers only unseen RSS entries and keeps stable identities', async () => {
    const feed = `<?xml version="1.0"?><rss><channel>
      <item><guid>item-2</guid><title>Second</title><link>https://example.com/second?utm_source=rss</link><pubDate>Mon, 14 Sep 2026 06:00:00 GMT</pubDate></item>
      <item><guid>item-1</guid><title>First</title><link>https://example.com/first</link><pubDate>Sun, 13 Sep 2026 06:00:00 GMT</pubDate></item>
    </channel></rss>`
    const adapter = new RssAdapter(async () => new Response(feed))
    const batch = await adapter.discover({
      feedUrl: 'https://example.com/rss.xml',
      cursor: 'item-1',
      limit: 20,
    })
    expect(batch.items).toEqual([
      expect.objectContaining({
        externalId: 'item-2',
        canonicalUrl: 'https://example.com/second',
      }),
    ])
    expect(batch.nextCursor).toBe('item-2')
  })

  it('continues an oversized backlog across runs without skipping entries', async () => {
    const feed = `<?xml version="1.0"?><rss><channel>
      ${[4, 3, 2, 1]
        .map(
          (number) =>
            `<item><guid>item-${number}</guid><title>Item ${number}</title><link>https://example.com/${number}</link></item>`
        )
        .join('')}
    </channel></rss>`
    const adapter = new RssAdapter(async () => new Response(feed))
    const seen = new Set<string>()
    const first = await adapter.discover({
      feedUrl: 'https://example.com/rss.xml',
      cursor: 'has-progress',
      limit: 2,
      isSeen: (id) => seen.has(id),
    })
    first.items.forEach((item) => seen.add(item.externalId))
    const second = await adapter.discover({
      feedUrl: 'https://example.com/rss.xml',
      cursor: first.nextCursor,
      limit: 2,
      isSeen: (id) => seen.has(id),
    })
    expect(first.items.map((item) => item.externalId)).toEqual([
      'item-1',
      'item-2',
    ])
    expect(second.items.map((item) => item.externalId)).toEqual([
      'item-3',
      'item-4',
    ])
    expect(second.nextCursor).toBe('item-4')
  })

  it('finds unseen entries after a cursor in an oldest-to-newest feed', async () => {
    const feed = `<rss><channel>
      <item><guid>old</guid><title>Old</title><link>https://example.com/old</link></item>
      <item><guid>new</guid><title>New</title><link>https://example.com/new</link></item>
    </channel></rss>`
    const adapter = new RssAdapter(async () => new Response(feed))
    const batch = await adapter.discover({
      feedUrl: 'https://example.com/rss.xml',
      cursor: 'old',
      limit: 20,
      isSeen: (id) => id === 'old',
    })
    expect(batch.items.map((item) => item.externalId)).toEqual(['new'])
  })

  it('prefers an Atom alternate article link over a self link', async () => {
    const feed = `<feed><entry><id>atom-1</id><title>Atom</title>
      <link rel="self" href="https://example.com/feed-entry" />
      <link rel="alternate" href="https://example.com/article" />
    </entry></feed>`
    const adapter = new RssAdapter(async () => new Response(feed))
    const batch = await adapter.discover({
      feedUrl: 'https://example.com/feed',
      limit: 1,
      incremental: true,
    })
    expect(batch.items[0]?.canonicalUrl).toBe('https://example.com/article')
  })

  it('limits first discovery to the newest 20 items from the last 7 days', async () => {
    const entries = Array.from({ length: 25 }, (_, index) => {
      const publishedAt =
        index === 24
          ? '2026-09-01T00:00:00.000Z'
          : new Date(
              Date.parse('2026-09-14T12:00:00.000Z') - index * 60_000
            ).toISOString()
      return `<item><guid>item-${index}</guid><title>Item ${index}</title><link>https://example.com/${index}</link><pubDate>${publishedAt}</pubDate></item>`
    }).join('')
    const adapter = new RssAdapter(
      async () => new Response(`<rss><channel>${entries}</channel></rss>`)
    )
    const batch = await adapter.discover({
      feedUrl: 'https://example.com/rss.xml',
      limit: 100,
      now: new Date('2026-09-14T12:00:00Z'),
    })
    expect(batch.items).toHaveLength(20)
    expect(batch.items[0]?.externalId).toBe('item-0')
    expect(batch.items.at(-1)?.externalId).toBe('item-19')
  })

  it('rejects an article whose extracted body is incomplete', async () => {
    await expect(
      enrichArticle(
        'https://example.com/thin',
        async () =>
          new Response('<html><body><p>too short</p></body></html>', {
            headers: { 'content-type': 'text/html' },
          })
      )
    ).rejects.toThrow(/complete article body/i)
  })
})

describe('analysis and end-to-end orchestration', () => {
  it('adapts Codex OAuth in memory without rewriting its auth file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'airadar-auth-'))
    roots.push(root)
    const authPath = path.join(root, 'auth.json')
    const payload = Buffer.from(
      JSON.stringify({ exp: 2_000_000_000 })
    ).toString('base64url')
    const original = JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: {
        access_token: `header.${payload}.signature`,
        refresh_token: 'refresh-test-only',
        account_id: 'account-test',
      },
    })
    await writeFile(authPath, original)
    const store = createReadOnlyCodexCredentialStore(authPath)
    expect(await store.list()).toEqual([
      { providerId: 'openai-codex', type: 'oauth' },
    ])
    expect((await store.read('openai-codex'))?.type).toBe('oauth')
    await store.modify('openai-codex', async (credential) => credential)
    expect(await readFile(authPath, 'utf8')).toBe(original)
  })

  it('calculates the score and two-level feed in TypeScript', () => {
    expect(calculateRecommendation(analysisArguments)).toEqual({
      totalScore: 80,
      recommendation: 'core',
    })
    expect(
      calculateRecommendation({
        ...analysisArguments,
        spam: { isSpam: true, reason: '广告营销' },
      }).recommendation
    ).toBe('none')
    expect(
      calculateRecommendation({
        ...analysisArguments,
        spam: { isSpam: false, reason: null },
      }).recommendation
    ).toBe('core')
  })

  it('uses Pi structured output, reuses a fingerprint, and versions manual reanalysis', async () => {
    const runtime = await repository()
    const { gateway, faux } = fauxGateway()
    const feed = `<?xml version="1.0"?><rss><channel><item>
      <guid>real-1</guid><title>Real article</title><link>https://example.com/article</link><pubDate>Mon, 14 Sep 2026 06:00:00 GMT</pubDate>
    </item></channel></rss>`
    const body = `<html><head><title>Real article</title></head><body><article><h1>Real article</h1><p>${'Substantial source material. '.repeat(30)}</p></article></body></html>`
    const fetcher = async (input: string | URL | Request) =>
      new Response(String(input).includes('rss.xml') ? feed : body, {
        headers: { 'content-type': 'text/html' },
      })
    const options = {
      repository: runtime,
      source: {
        id: 'rss-source',
        feedUrl: 'https://example.com/rss.xml',
      },
      fetcher,
      modelGateway: gateway,
      profile: '长期从事技术、产品和销售，关注人工智能实际应用。',
      profileVersionId: 'profile-1',
      ruleVersion: 'rules-1',
      modelRouteVersion: 'route-1',
      limit: 20,
    }
    const first = await runRssPipeline(options)
    expect(first.succeeded).toBe(1)
    expect(first.failed).toBe(0)
    expect(faux.state.callCount).toBe(1)
    expect(runtime.listAnalyses()).toHaveLength(1)
    expect(runtime.indexedContentCount()).toBe(1)

    const content = runtime.listContents()[0]!
    const repeatOptions = {
      modelGateway: gateway,
      profile: options.profile,
      profileVersionId: options.profileVersionId,
      ruleVersion: options.ruleVersion,
      modelRouteVersion: options.modelRouteVersion,
      manual: false,
    }
    const repeated = await Promise.all([
      analyzeStoredContent(runtime, content.id, repeatOptions),
      analyzeStoredContent(runtime, content.id, repeatOptions),
    ])
    expect(repeated[0].id).toBe(repeated[1].id)
    expect(faux.state.callCount).toBe(1)
    const manual = await runRssPipeline({
      ...options,
      cursor: undefined,
      manualReanalysisContentId: content.id,
    })
    expect(manual.succeeded).toBe(1)
    expect(faux.state.callCount).toBe(2)
    expect(
      runtime.listAnalyses(content.id).map((result) => result.version)
    ).toEqual([2, 1])
    await runtime.close()
  })

  it('does not analyze or publish an incompletely enriched article', async () => {
    const runtime = await repository()
    const { gateway, faux } = fauxGateway()
    const feed = `<?xml version="1.0"?><rss><channel><item><guid>thin-1</guid><title>Thin</title><link>https://example.com/thin</link><pubDate>2026-09-14T00:00:00Z</pubDate></item></channel></rss>`
    const fetcher = async (input: string | URL | Request) =>
      new Response(
        String(input).includes('rss.xml')
          ? feed
          : '<html><body><p>thin</p></body></html>',
        { headers: { 'content-type': 'text/html' } }
      )
    const result = await runRssPipeline({
      repository: runtime,
      source: { id: 'rss-source', feedUrl: 'https://example.com/rss.xml' },
      fetcher,
      modelGateway: gateway,
      profile: '关注人工智能',
      profileVersionId: 'profile-1',
      ruleVersion: 'rules-1',
      modelRouteVersion: 'route-1',
      limit: 20,
    })
    expect(result.failed).toBe(1)
    expect(faux.state.callCount).toBe(0)
    expect(runtime.listAnalyses()).toEqual([])
    await runtime.close()
  })

  it('does not advance progress past a transient failure and retries next run', async () => {
    const runtime = await repository()
    const { gateway, faux } = fauxGateway()
    const feed = `<?xml version="1.0"?><rss><channel><item><guid>retry-1</guid><title>Retry</title><link>https://example.com/retry</link><pubDate>2026-09-10T00:00:00Z</pubDate></item></channel></rss>`
    let articleAttempts = 0
    const options = {
      repository: runtime,
      source: { id: 'rss-retry', feedUrl: 'https://example.com/rss.xml' },
      fetcher: async (input: string | URL | Request) => {
        if (String(input).includes('rss.xml')) return new Response(feed)
        articleAttempts += 1
        return new Response(
          articleAttempts === 1
            ? '<html><body>thin</body></html>'
            : `<html><body><article><p>${'Complete retry body. '.repeat(30)}</p></article></body></html>`,
          { headers: { 'content-type': 'text/html' } }
        )
      },
      modelGateway: gateway,
      profile: '关注人工智能',
      profileVersionId: 'profile-1',
      ruleVersion: 'rules-1',
      modelRouteVersion: 'route-1',
      limit: 1,
    }
    expect(
      (
        await runRssPipeline({
          ...options,
          now: new Date('2026-09-14T00:00:00Z'),
        })
      ).failed
    ).toBe(1)
    expect(runtime.getProgress('rss-retry')).toMatchObject({
      baselineExternalIds: ['retry-1'],
    })
    expect(runtime.getProgress('rss-retry')?.cursor).toBeUndefined()
    expect(
      (
        await runRssPipeline({
          ...options,
          now: new Date('2026-09-30T00:00:00Z'),
        })
      ).succeeded
    ).toBe(1)
    expect(runtime.getProgress('rss-retry')?.cursor).toBe('retry-1')
    expect(faux.state.callCount).toBe(1)
    await runtime.close()
  })

  it('persists the first-feed baseline and never backfills omitted history', async () => {
    const runtime = await repository()
    const { gateway, faux } = fauxGateway()
    const feed = `<rss><channel>
      <item><guid>newest</guid><title>Newest</title><link>https://example.com/newest</link><pubDate>2026-09-14T10:00:00Z</pubDate></item>
      <item><guid>recent-omitted</guid><title>Recent omitted</title><link>https://example.com/recent-omitted</link><pubDate>2026-09-13T10:00:00Z</pubDate></item>
      <item><guid>old</guid><title>Old</title><link>https://example.com/old</link><pubDate>2026-08-01T10:00:00Z</pubDate></item>
    </channel></rss>`
    const body = `<html><body><article><p>${'Complete current body. '.repeat(30)}</p></article></body></html>`
    const options = {
      repository: runtime,
      source: { id: 'rss-baseline', feedUrl: 'https://example.com/rss.xml' },
      fetcher: async (input: string | URL | Request) =>
        new Response(String(input).includes('rss.xml') ? feed : body, {
          headers: { 'content-type': 'text/html' },
        }),
      modelGateway: gateway,
      profile: '关注人工智能',
      profileVersionId: 'profile-1',
      ruleVersion: 'rules-1',
      modelRouteVersion: 'route-1',
      limit: 1,
    }
    expect((await runRssPipeline(options)).discovered).toBe(1)
    expect((await runRssPipeline(options)).discovered).toBe(0)
    expect(runtime.indexedContentCount()).toBe(1)
    expect(runtime.getProgress('rss-baseline')?.baselineExternalIds).toEqual([
      'newest',
      'recent-omitted',
      'old',
    ])
    expect(faux.state.callCount).toBe(1)
    await runtime.close()
  })

  it('freezes the first baseline before processing and retries only failed selections', async () => {
    const runtime = await repository()
    const { gateway, faux } = fauxGateway()
    const feed = `<rss><channel>
      <item><guid>selected-a</guid><title>A</title><link>https://example.com/a</link><pubDate>2026-09-14T10:00:00Z</pubDate></item>
      <item><guid>selected-b</guid><title>B</title><link>https://example.com/b</link><pubDate>2026-09-14T09:00:00Z</pubDate></item>
      <item><guid>historical-c</guid><title>C</title><link>https://example.com/c</link><pubDate>2026-08-01T00:00:00Z</pubDate></item>
    </channel></rss>`
    let aAttempts = 0
    const options = {
      repository: runtime,
      source: { id: 'rss-partial', feedUrl: 'https://example.com/rss.xml' },
      fetcher: async (input: string | URL | Request) => {
        const value = String(input)
        if (value.includes('rss.xml')) return new Response(feed)
        if (value.endsWith('/a')) aAttempts += 1
        const thin = value.endsWith('/a') && aAttempts === 1
        return new Response(
          thin
            ? '<html><body>thin</body></html>'
            : `<html><body><article><p>${'Complete selected body. '.repeat(30)}</p></article></body></html>`,
          { headers: { 'content-type': 'text/html' } }
        )
      },
      modelGateway: gateway,
      profile: '关注人工智能',
      profileVersionId: 'profile-1',
      ruleVersion: 'rules-1',
      modelRouteVersion: 'route-1',
      limit: 2,
      now: new Date('2026-09-14T12:00:00Z'),
    }
    const first = await runRssPipeline(options)
    expect(first).toMatchObject({ discovered: 2, succeeded: 1, failed: 1 })
    expect(runtime.getProgress('rss-partial')?.baselineExternalIds).toEqual([
      'selected-a',
      'selected-b',
      'historical-c',
    ])
    const second = await runRssPipeline({
      ...options,
      now: new Date('2026-09-30T12:00:00Z'),
    })
    expect(second).toMatchObject({ discovered: 1, succeeded: 1, failed: 0 })
    expect(runtime.indexedContentCount()).toBe(2)
    expect(faux.state.callCount).toBe(2)
    await runtime.close()
  })

  it('merges feed links that redirect to the same final article identity', async () => {
    const runtime = await repository()
    const { gateway, faux } = fauxGateway()
    const feed = `<?xml version="1.0"?><rss><channel>
      <item><guid>redirect-2</guid><title>Second alias</title><link>https://example.com/go-2</link><pubDate>2026-09-14T01:00:00Z</pubDate></item>
      <item><guid>redirect-1</guid><title>First alias</title><link>https://example.com/go-1</link><pubDate>2026-09-14T00:00:00Z</pubDate></item>
    </channel></rss>`
    const body = `<html><body><article><p>${'Canonical article body. '.repeat(30)}</p></article></body></html>`
    await runRssPipeline({
      repository: runtime,
      source: { id: 'rss-redirect', feedUrl: 'https://example.com/rss.xml' },
      fetcher: async (input) => {
        if (String(input).includes('rss.xml')) return new Response(feed)
        const response = new Response(body, {
          headers: { 'content-type': 'text/html' },
        })
        Object.defineProperty(response, 'url', {
          value: 'https://example.com/final',
        })
        return response
      },
      modelGateway: gateway,
      profile: '关注人工智能',
      profileVersionId: 'profile-1',
      ruleVersion: 'rules-1',
      modelRouteVersion: 'route-1',
      limit: 2,
    })
    expect(faux.state.callCount).toBe(1)
    expect(runtime.listAnalyses()).toHaveLength(1)
    expect(runtime.indexedContentCount()).toBe(1)
    const discoveries = runtime.listDiscoveries('rss-redirect')
    expect(discoveries).toHaveLength(2)
    expect(new Set(discoveries.map((entry) => entry.contentId)).size).toBe(1)
    expect(discoveries[0]?.contentId).toBe(runtime.listContents()[0]?.id)
    expect(
      runtime
        .listContents()
        .filter((content) => runtime.listAnalyses(content.id).length)
    ).toEqual([
      expect.objectContaining({ canonicalUrl: 'https://example.com/final' }),
    ])
    await runtime.close()
  })

  it('keeps model usage and error evidence when structured output is invalid', async () => {
    const runtime = await repository()
    const models = createModels()
    const faux = fauxProvider()
    models.setProvider(faux.provider)
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall('submit_analysis', {
          ...analysisArguments,
          summary: 'too short',
        })
      ),
    ])
    const feed = `<?xml version="1.0"?><rss><channel><item><guid>invalid-1</guid><title>Invalid analysis</title><link>https://example.com/invalid</link><pubDate>2026-09-14T00:00:00Z</pubDate></item></channel></rss>`
    const body = `<html><body><article><h1>Invalid</h1><p>${'Complete body. '.repeat(30)}</p></article></body></html>`
    const result = await runRssPipeline({
      repository: runtime,
      source: { id: 'rss-source', feedUrl: 'https://example.com/rss.xml' },
      fetcher: async (input) =>
        new Response(String(input).includes('rss.xml') ? feed : body, {
          headers: { 'content-type': 'text/html' },
        }),
      modelGateway: createPiModelGateway(models, faux.getModel()),
      profile: '关注人工智能',
      profileVersionId: 'profile-1',
      ruleVersion: 'rules-1',
      modelRouteVersion: 'route-1',
      limit: 1,
    })
    expect(result.failed).toBe(1)
    expect(runtime.listAnalyses()).toEqual([])
    expect(runtime.listAnalysisCalls()).toEqual([
      expect.objectContaining({
        provider: faux.getModel().provider,
        model: faux.getModel().id,
        status: 'failed',
        usage: expect.objectContaining({ inputTokens: expect.any(Number) }),
        error: expect.stringMatching(/too small|too short|20/i),
      }),
    ])
    const rawFiles = await readdir(path.join(runtime.root, '.raw-responses'))
    const rawRecords = await Promise.all(
      rawFiles.map(async (file) =>
        JSON.parse(
          await readFile(
            path.join(runtime.root, '.raw-responses', file),
            'utf8'
          )
        )
      )
    )
    expect(rawRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: faux.getModel().provider,
          payload: expect.objectContaining({
            request: expect.objectContaining({
              context: expect.objectContaining({
                systemPrompt: expect.any(String),
                messages: expect.any(Array),
                tools: expect.any(Array),
              }),
              options: expect.objectContaining({ maxTokens: 2_500 }),
            }),
            response: expect.any(Object),
          }),
        }),
      ])
    )
    await runtime.close()
  })
})
