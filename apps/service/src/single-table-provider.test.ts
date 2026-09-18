import { expect, it } from 'vitest'

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
