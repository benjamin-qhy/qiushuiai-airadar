import { describe, expect, it } from 'vitest'
import { defineSourceAdapter } from './index.js'

describe('source adapter contract', () => {
  it('keeps provider discovery behind one source-typed interface', async () => {
    const adapter = defineSourceAdapter({
      providerId: 'native-rss',
      sourceType: 'rss',
      async discover(request) {
        return { items: [], nextCursor: request.cursor }
      },
    })

    expect(adapter.providerId).toBe('native-rss')
    expect(
      await adapter.discover({
        source: {
          id: 'source-1',
          slug: 'openai-news',
          name: 'OpenAI News',
          type: 'rss',
          externalIdentity: 'https://openai.com/news/rss.xml',
          status: 'enabled',
        },
        cursor: 'cursor-1',
        limit: 20,
      })
    ).toEqual({
      items: [],
      nextCursor: 'cursor-1',
      providerId: 'native-rss',
    })
  })

  it('rejects an adapter used with the wrong source type before calling a provider', async () => {
    const adapter = defineSourceAdapter({
      providerId: 'native-rss',
      sourceType: 'rss',
      async discover() {
        throw new Error('provider must not be called')
      },
    })

    await expect(
      adapter.discover({
        source: {
          id: 'source-2',
          slug: 'openai-x',
          name: 'OpenAI X',
          type: 'x',
          externalIdentity: 'OpenAI',
          status: 'enabled',
        },
        limit: 20,
      })
    ).rejects.toThrow('does not support source type')
  })
})
