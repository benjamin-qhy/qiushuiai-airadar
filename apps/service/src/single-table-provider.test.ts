import { expect, it, vi } from 'vitest'

import { createSingleTableSourceProvider } from './single-table-provider.js'

it('discovers one RSS page, fetches article body, and records both requests and responses', async () => {
  const requested: string[] = []
  const articleText =
    'This article explains a practical AI agent workflow with a concrete example and useful limitations. '.repeat(
      8
    )
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith('feed.xml')) {
      return new Response(
        `<rss><channel><item><guid>one</guid><title>Example</title><link>https://example.com/article</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
        {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        }
      )
    }
    return new Response(
      `<html><head><title>Example Article</title></head><body><article><h1>Example Article</h1><p>${articleText}</p></article></body></html>`,
      {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }
    )
  }
  const provider = createSingleTableSourceProvider({ fetch: fetcher })
  const source = {
    id: 'feed',
    platform: 'rss',
    account_name: 'Example',
    external_identity: 'https://example.com/feed.xml',
    language: 'en' as const,
    enabled: true,
  }
  const page = await provider.discover(source, 20)
  expect(page.items).toHaveLength(1)
  expect(requested).toEqual(['https://example.com/feed.xml'])
  expect(JSON.stringify(page.response)).toContain('Example')
  const resolved = await provider.resolve(source, page.items[0]!)
  expect(requested).toEqual([
    'https://example.com/feed.xml',
    'https://example.com/article',
  ])
  expect(resolved.original.body).toContain('practical AI agent workflow')
  expect(resolved.original.originalTitle).toBe('Example Article')
  expect(resolved.calls?.[0]?.request).toMatchObject({
    method: 'GET',
    url: 'https://example.com/article',
  })
  expect(JSON.stringify(resolved.calls?.[0]?.response)).toContain(
    'Example Article'
  )
})

it('uses the native article request path for live RSS and keeps an audit event', async () => {
  const originalFetch = globalThis.fetch
  const feedUrl = 'https://example.com/feed.xml'
  const articleUrl = 'https://example.com/article'
  globalThis.fetch = vi.fn(
    async () =>
      new Response(
        `<rss><channel><item><guid>one</guid><title>Example</title><link>${articleUrl}</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
        { status: 200, headers: { 'content-type': 'application/xml' } }
      )
  ) as typeof fetch
  try {
    const articleEnricher = vi.fn(
      async (_url: string, fetcher?: typeof fetch) => {
        if (fetcher) throw new Error('Wrapped article request used')
        return {
          title: 'Example Article',
          body: 'Complete article body. '.repeat(20),
          canonicalUrl: articleUrl,
          images: [],
        }
      }
    )
    const provider = createSingleTableSourceProvider({ articleEnricher })
    const source = {
      id: 'feed',
      platform: 'rss',
      account_name: 'Example',
      external_identity: feedUrl,
      language: 'en' as const,
      enabled: true,
    }
    const page = await provider.discover(source, 1)
    const resolved = await provider.resolve(source, page.items[0]!)
    expect(articleEnricher).toHaveBeenCalledWith(articleUrl)
    expect(resolved.original.body).toContain('Complete article body')
    expect(resolved.calls?.[0]).toMatchObject({
      request: { method: 'GET', url: articleUrl },
      response: { title: 'Example Article' },
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

it('passes X timeline interaction counts through single-table discovery', async () => {
  const provider = createSingleTableSourceProvider({
    twitterApiKey: 'test-only',
    fetch: async (input) =>
      String(input).includes('/user/info')
        ? Response.json({ data: { id: 'author-1' } })
        : Response.json({
            data: {
              tweets: [
                {
                  id: '123456789',
                  text: 'A useful AI workflow update.',
                  createdAt: 'Fri Sep 18 01:00:00 +0000 2026',
                  viewCount: 26743,
                  likeCount: 623,
                  replyCount: 77,
                  retweetCount: 21,
                },
              ],
            },
          }),
  })
  const source = {
    id: 'x-example',
    platform: 'x',
    account_name: 'X / Example',
    external_identity: 'Example',
    language: 'en' as const,
    enabled: true,
  }
  const page = await provider.discover(source, 1)
  expect(page.items[0]?.interaction).toMatchObject({
    views: 26743,
    likes: 623,
    comments: 77,
    shares: 21,
  })
})

it('keeps the provider default page size when collection does not set a limit', async () => {
  const tweets = Array.from({ length: 25 }, (_, index) => ({
    id: String(123456789 + index),
    text: `Post ${index + 1}`,
    createdAt: 'Fri Sep 18 01:00:00 +0000 2026',
  }))
  const provider = createSingleTableSourceProvider({
    twitterApiKey: 'test-only',
    fetch: async (input) =>
      String(input).includes('/user/info')
        ? Response.json({ data: { id: 'author-1' } })
        : Response.json({ data: { tweets } }),
  })
  const page = await provider.discover({
    id: 'x-example',
    platform: 'x',
    account_name: 'X / Example',
    external_identity: 'Example',
    language: 'en',
    enabled: true,
  })
  expect(page.items).toHaveLength(25)
})
