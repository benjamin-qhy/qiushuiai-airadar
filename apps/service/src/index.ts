import { createServer, type Server } from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'

import { RuntimeRepository } from '@airadar/runtime'

interface FeedItem {
  id: string
  title: string
  url?: string
  publishedAt?: string
  summary: string
  topics: string[]
  totalScore: number
  recommendation: 'core' | 'explore' | 'none'
  analyzedAt: string
  kind?: 'short_post' | 'video' | 'image_post' | 'article'
}

function feedContentKind(value: unknown): FeedItem['kind'] {
  return value === 'short_post' ||
    value === 'video' ||
    value === 'image_post' ||
    value === 'article'
    ? value
    : undefined
}

function feedItems(repository: RuntimeRepository): FeedItem[] {
  const latestByContent = new Map<
    string,
    ReturnType<RuntimeRepository['listAnalyses']>[number]
  >()
  for (const analysis of repository.listAnalyses()) {
    if (!latestByContent.has(analysis.contentId)) {
      latestByContent.set(analysis.contentId, analysis)
    }
  }
  return repository
    .listContents()
    .flatMap((content) => {
      const analysis = latestByContent.get(content.id)
      if (!analysis) return []
      const result = analysis.result
      const recommendation = result.recommendation
      if (
        recommendation !== 'core' &&
        recommendation !== 'explore' &&
        recommendation !== 'none'
      ) {
        return []
      }
      const acceptedRecommendation: FeedItem['recommendation'] = recommendation
      return [
        {
          id: content.id,
          title: content.title,
          url: content.canonicalUrl,
          publishedAt: content.publishedAt,
          summary:
            typeof result.summary === 'string' ? result.summary : '暂无摘要',
          topics: Array.isArray(result.topics)
            ? result.topics.filter(
                (topic): topic is string => typeof topic === 'string'
              )
            : [],
          totalScore:
            typeof result.totalScore === 'number' ? result.totalScore : 0,
          recommendation: acceptedRecommendation,
          analyzedAt: analysis.createdAt,
          kind: feedContentKind(content.kind),
        },
      ]
    })
    .sort((left, right) => right.analyzedAt.localeCompare(left.analyzedAt))
}

function allowLocalWebOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      ? origin
      : undefined
  } catch {
    return undefined
  }
}

export interface ServiceAddress {
  host: string
  port: number
}

export interface ServiceApp {
  start(options: ServiceAddress): Promise<ServiceAddress>
  stop(): Promise<void>
}

export function createServiceApp(
  options: { dataRoot?: string } = {}
): ServiceApp {
  let server: Server | undefined
  let repository: RuntimeRepository | undefined
  const dataRoot =
    options.dataRoot ??
    process.env.AIRADAR_DATA_ROOT ??
    path.join(homedir(), '.airadar', 'data')

  return {
    async start(options) {
      if (server) throw new Error('AI Radar service is already running')
      repository = await RuntimeRepository.open(dataRoot)
      server = createServer((request, response) => {
        response.setHeader('content-type', 'application/json; charset=utf-8')
        const allowedOrigin = allowLocalWebOrigin(request.headers.origin)
        if (allowedOrigin) {
          response.setHeader('access-control-allow-origin', allowedOrigin)
          response.setHeader('vary', 'origin')
        }
        if (request.method === 'GET' && request.url === '/health') {
          response.statusCode = 200
          response.end(JSON.stringify({ service: 'airadar', status: 'ready' }))
          return
        }
        if (
          request.method === 'GET' &&
          (request.url === '/api/contents' || request.url === '/api/daily')
        ) {
          const items = feedItems(repository!)
          response.statusCode = 200
          response.end(
            JSON.stringify({
              items:
                request.url === '/api/daily'
                  ? items.filter(
                      (item) =>
                        item.recommendation === 'core' ||
                        item.recommendation === 'explore'
                    )
                  : items,
            })
          )
          return
        }
        response.statusCode = 404
        response.end(JSON.stringify({ error: 'not_found' }))
      })

      try {
        await new Promise<void>((resolve, reject) => {
          server?.once('error', reject)
          server?.listen(options.port, options.host, resolve)
        })
      } catch (error) {
        server = undefined
        await repository.close()
        repository = undefined
        throw error
      }
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Service did not bind a TCP address')
      return { host: options.host, port: address.port }
    },
    async stop() {
      const activeServer = server
      const activeRepository = repository
      server = undefined
      repository = undefined
      if (activeServer) {
        await new Promise<void>((resolve, reject) => {
          activeServer.close((error) => (error ? reject(error) : resolve()))
        })
      }
      await activeRepository?.close()
    },
  }
}
