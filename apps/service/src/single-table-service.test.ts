import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, it } from 'vitest'

import { initializeSingleTableConfig } from '@airadar/config'
import { SingleTableRepository } from '@airadar/runtime'

import { createSingleTableServiceApp } from './single-table-service.js'

it('reclassifies a previously failed X plugin directory on retry without fetching it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'airadar-directory-retry-'))
  let service: ReturnType<typeof createSingleTableServiceApp> | undefined
  try {
    const configRoot = await initializeSingleTableConfig(
      path.resolve(import.meta.dirname, '../../../config'),
      root
    )
    const repository = await SingleTableRepository.open(root)
    const row = await repository.recordUnavailable(
      {
        platform: 'x',
        sourceType: 'x',
        sourceAccountId: 'x_openai',
        sourceAccountName: 'OpenAI',
        externalContentId: '2097523484629090408',
        canonicalUrl: 'https://chatgpt.com/plugins?category=small-business',
        title: 'Plugins for small businesses',
        originalTitle: 'Plugins for small businesses',
        kind: 'article',
        format: 'plain_text',
        language: 'en',
      },
      'Could not extract a complete article body'
    )
    repository.close()
    service = createSingleTableServiceApp({ dataRoot: root, configRoot })
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const response = await fetch(
      `http://${address.host}:${address.port}/api/contents/${row.id}/retry`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    )
    expect(response.status).toBe(200)
    expect((await response.json()) as unknown).toMatchObject({
      item: {
        junk: {
          isJunk: true,
          source: 'rule',
          reason: '目录页：插件列表，不是单篇文章',
        },
      },
    })
  } finally {
    await service?.stop()
    await rm(root, { recursive: true, force: true })
  }
})

it('serves and updates content from the single table, with field-only keyword search', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'airadar-single-api-'))
  let service: ReturnType<typeof createSingleTableServiceApp> | undefined
  try {
    const configRoot = await initializeSingleTableConfig(
      path.resolve(import.meta.dirname, '../../../config'),
      root
    )
    const repository = await SingleTableRepository.open(root)
    const row = await repository.saveOriginal({
      platform: 'x',
      sourceType: 'x',
      sourceAccountId: 'x_openai',
      sourceAccountName: 'OpenAI',
      externalContentId: 'api-test',
      title: 'English post',
      body: 'An AI agent workflow.',
      kind: 'short_post',
      format: 'plain_text',
      language: 'en',
    })
    await repository.saveClassification(row.id, {
      keywords: ['智能体'],
      isJunk: false,
    })
    await repository.appendLog(row.id, {
      action: 'classify',
      stage: 'classifying',
      status: 'succeeded',
      durationMs: 12,
      request: { prompt: '测试', apiKey: 'private-secret' },
      response: { result: '智能体' },
    })
    repository.close()
    service = createSingleTableServiceApp({ dataRoot: root, configRoot })
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const base = `http://${address.host}:${address.port}`
    const found = (await fetch(
      `${base}/api/contents?keyword=${encodeURIComponent('智能体')}`
    ).then((response) => response.json())) as {
      items: Array<Record<string, unknown>>
    }
    expect(found.items).toHaveLength(1)
    expect(found.items[0]).toMatchObject({
      id: row.id,
      keywordsText: '智能体',
      totalScore: null,
      externalContentId: 'api-test',
      originalFormat: 'plain_text',
      processStage: 'scoring',
    })
    const logs = (await fetch(`${base}/api/contents/${row.id}/logs`).then(
      (response) => response.json()
    )) as { items: Array<{ index: number; action: string; request?: string }> }
    expect(logs.items[0]).toMatchObject({ action: 'classify' })
    expect(logs.items[0]).not.toHaveProperty('request')
    const logDetail = (await fetch(
      `${base}/api/contents/${row.id}/logs?entry=${logs.items[0]!.index}`
    ).then((response) => response.json())) as {
      item: { request: string; response: string }
    }
    expect(logDetail.item.request).toContain('[REDACTED]')
    expect(logDetail.item.request).not.toContain('private-secret')
    expect(logDetail.item.response).toContain('智能体')
    expect(
      (await fetch(`${base}/api/contents/${row.id}/logs?entry=-1`)).status
    ).toBe(404)
    expect((await fetch(`${base}/api/contents/not-found/logs`)).status).toBe(
      404
    )
    const absent = (await fetch(`${base}/api/contents?keyword=不存在`).then(
      (response) => response.json()
    )) as { items: unknown[] }
    expect(absent.items).toHaveLength(0)
    const changed = await fetch(`${base}/api/contents/${row.id}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
    expect(changed.status).toBe(200)
    expect(
      ((await changed.json()) as { item: { read: boolean } }).item.read
    ).toBe(true)
    const runtime = (await fetch(`${base}/api/runtime`).then((response) =>
      response.json()
    )) as {
      mode: string
      total: number
      recent: unknown[]
    }
    expect(runtime).toMatchObject({ mode: 'single-table', total: 1 })
    expect(runtime.recent).toHaveLength(1)
    const config = (await fetch(`${base}/api/config`).then((response) =>
      response.json()
    )) as {
      mode: string
      files: Array<{ name: string; content: string }>
    }
    expect(config.mode).toBe('file')
    expect(config.files.map((file) => file.name)).toContain('analysis.yaml')
    expect(JSON.stringify(config)).not.toContain('TIKHUB_API_KEY')
    const providers = (await fetch(`${base}/api/providers`).then((response) =>
      response.json()
    )) as {
      items: Array<{ id: string; secretStatus: { configured: boolean } }>
    }
    expect(
      providers.items.find((provider) => provider.id === 'native-rss')
        ?.secretStatus.configured
    ).toBe(true)
    const toggled = await fetch(`${base}/api/sources/x_openai/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    })
    expect(toggled.status).toBe(200)
    const sources = (await fetch(`${base}/api/sources`).then((response) =>
      response.json()
    )) as {
      items: Array<{ id: string; status: string }>
    }
    expect(
      sources.items.find((source) => source.id === 'x_openai')?.status
    ).toBe('disabled')
  } finally {
    await service?.stop()
    await rm(root, { recursive: true })
  }
})

it('only reruns a failed row after an explicit manual retry request', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'airadar-manual-retry-'))
  let service: ReturnType<typeof createSingleTableServiceApp> | undefined
  try {
    const configRoot = await initializeSingleTableConfig(
      path.resolve(import.meta.dirname, '../../../config'),
      root
    )
    const repository = await SingleTableRepository.open(root)
    const row = await repository.saveOriginal({
      platform: 'x',
      sourceType: 'x',
      sourceAccountId: 'x_openai',
      sourceAccountName: 'OpenAI',
      externalContentId: 'retry-test',
      title: 'Failed English post',
      body: 'An AI agent workflow.',
      kind: 'short_post',
      format: 'plain_text',
      language: 'en',
    })
    repository.fail(row.id, 'classify', new Error('Previous model failure'))
    repository.close()
    let calls = 0
    service = createSingleTableServiceApp({
      dataRoot: root,
      configRoot,
      gateway: {
        async complete() {
          calls++
          return {
            text: '---\nkeywords: ["智能体"]\nspam:\n  isJunk: true\n  reason: "低价值"\n---',
            provider: 'mock',
            model: 'mock',
            durationMs: 1,
          }
        },
      },
    })
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const retry = await fetch(
      `http://${address.host}:${address.port}/api/contents/${row.id}/retry`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    )
    expect(retry.status).toBe(200)
    expect(calls).toBe(1)
    const repeated = await fetch(
      `http://${address.host}:${address.port}/api/contents/${row.id}/retry`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    )
    expect(repeated.status).toBe(409)
    const log = await readFile(
      path.join(root, row.execution_log_markdown_path),
      'utf8'
    )
    expect(log).toContain('manual-retry')
  } finally {
    await service?.stop()
    await rm(root, { recursive: true })
  }
})
