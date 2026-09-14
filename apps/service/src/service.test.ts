import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RuntimeRepository } from '@airadar/runtime'
import { createServiceApp, type ServiceApp } from './index.js'

describe('background service shell', () => {
  let service: ServiceApp | undefined
  let dataRoot: string

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'airadar-service-'))
  })

  afterEach(async () => {
    await service?.stop()
    await rm(dataRoot, { recursive: true })
  })

  it('starts on loopback and exposes only a minimal health response', async () => {
    service = createServiceApp({ dataRoot })
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const response = await fetch(
      `http://${address.host}:${address.port}/health`,
      { headers: { origin: 'http://localhost:5173' } }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173'
    )
    expect(await response.json()).toEqual({
      service: 'airadar',
      status: 'ready',
    })
  })

  it('does not expose unknown routes', async () => {
    service = createServiceApp({ dataRoot })
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const response = await fetch(
      `http://${address.host}:${address.port}/secrets`
    )

    expect(response.status).toBe(404)
  })

  it('serves all analyzed content and a filtered daily feed from real records', async () => {
    const repository = await RuntimeRepository.open(dataRoot)
    await repository.commitDiscoveryBatch({
      sourceId: 'rss',
      nextCursor: '2',
      contents: [
        {
          id: 'content-core',
          title: 'Core item',
          body: 'Complete body',
          canonicalUrl: 'https://example.com/core',
          enrichmentStatus: 'succeeded',
          kind: 'image_post',
        },
        {
          id: 'content-none',
          title: 'Other item',
          body: 'Complete body',
          canonicalUrl: 'https://example.com/other',
          enrichmentStatus: 'succeeded',
        },
      ],
      discoveries: [
        {
          id: 'discovery-core',
          sourceId: 'rss',
          contentId: 'content-core',
          discoveredAt: '2026-09-14T00:00:00.000Z',
        },
        {
          id: 'discovery-none',
          sourceId: 'rss',
          contentId: 'content-none',
          discoveredAt: '2026-09-14T00:00:01.000Z',
        },
      ],
    })
    for (const [id, recommendation] of [
      ['content-core', 'core'],
      ['content-none', 'none'],
    ] as const) {
      await repository.saveAnalysis({
        id: `analysis-${id}`,
        contentId: id,
        fingerprint: `fingerprint-${id}`,
        version: 1,
        manual: false,
        provider: 'test',
        model: 'test-model',
        promptVersion: 'prompt-1',
        profileVersionId: 'profile-1',
        ruleVersion: 'rules-1',
        createdAt: '2026-09-14T01:00:00.000Z',
        durationMs: 1,
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: 0,
        },
        result: {
          summary: `${id} summary`,
          topics: ['AI'],
          totalScore: recommendation === 'core' ? 90 : 20,
          recommendation,
          spam: { isSpam: false },
        },
      })
    }
    await repository.close()

    service = createServiceApp({ dataRoot })
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const base = `http://${address.host}:${address.port}`
    const all = (await (await fetch(`${base}/api/contents`)).json()) as {
      items: Array<{ id: string; kind?: string }>
    }
    const daily = (await (await fetch(`${base}/api/daily`)).json()) as {
      items: Array<{ id: string }>
    }
    expect(all.items.map((item) => item.id)).toEqual([
      'content-core',
      'content-none',
    ])
    expect(all.items[0]?.kind).toBe('image_post')
    expect(daily.items.map((item) => item.id)).toEqual(['content-core'])
  })
})
