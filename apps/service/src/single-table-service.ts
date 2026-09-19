import { createServer, type IncomingMessage, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import {
  createFileSecretReader,
  editableConfigFileNames,
  loadSingleTableConfig,
  loadSourceState,
  saveEditableConfigFile,
  saveProvidersConfig,
  saveSourcesConfig,
  saveSourceState,
  sourcesConfigSchema,
  updateFileSecret,
  type SingleTableConfig,
} from '@qiushuiai-airadar/config'
import {
  SingleTableRepository,
  type ContentRow,
} from '@qiushuiai-airadar/runtime'
import { classifyNonArticlePage } from '@qiushuiai-airadar/source-adapters'
import {
  createSingleTableCodexGateway,
  processSingleTableContent,
  type SingleTableModelGateway,
} from '@qiushuiai-airadar/pipeline'
import { createSingleTableSourceProvider } from './single-table-provider.js'

const scoreNames = {
  interest_fit: 'interestFit',
  concrete_gain: 'concreteGain',
  substance: 'substance',
  new_information: 'newInformation',
} as const

const providerDefinitions = [
  {
    id: 'twitterapi.io',
    name: 'TwitterAPI.io',
    sourceType: 'x',
    secretName: 'TWITTERAPI_IO_KEY',
  },
  {
    id: 'tikhub-x',
    name: 'TikHub X',
    sourceType: 'x',
    secretName: 'TIKHUB_API_KEY',
  },
  {
    id: 'youtube-data-api',
    name: 'YouTube Data API',
    sourceType: 'youtube',
    secretName: 'YOUTUBE_API_KEY',
  },
  {
    id: 'tikhub-youtube',
    name: 'TikHub YouTube',
    sourceType: 'youtube',
    secretName: 'TIKHUB_API_KEY',
  },
  {
    id: 'native-rss',
    name: '原生 RSS',
    sourceType: 'rss',
  },
] as const

function sourceItem(
  source: SingleTableConfig['sources']['sources'][number],
  enabled: boolean
) {
  return {
    id: source.id,
    name: source.account_name,
    type: source.platform,
    language: source.language,
    externalIdentity: source.external_identity,
    status: enabled ? ('enabled' as const) : ('disabled' as const),
    health: enabled ? ('healthy' as const) : ('disabled' as const),
    effectiveParameters: { ids: [], values: {} },
  }
}

function sourceFromBody(body: Record<string, unknown>) {
  const candidate = {
    id: body.id,
    platform: body.type,
    account_name: body.name,
    external_identity: body.externalIdentity,
    language: body.language,
    enabled: body.enabled !== false,
  }
  return sourcesConfigSchema.parse({ sources: [candidate] }).sources[0]!
}

function providerOrder(
  config: SingleTableConfig,
  platform: 'x' | 'youtube'
): string[] {
  const preferred = config.providers.platforms[platform].preferred
  const fallback =
    platform === 'x'
      ? preferred === 'twitterapi.io'
        ? 'tikhub-x'
        : 'twitterapi.io'
      : preferred === 'youtube-data-api'
        ? 'tikhub-youtube'
        : 'youtube-data-api'
  return [preferred, fallback]
}

function arrayValue(value: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface LogEntry {
  index: number
  timestamp: string
  action: string
  status: string
  stage?: string
  trigger?: string
  duration?: string
  retryCount?: string
  processor?: string
  prompt?: string
  error?: string
  request?: string
  response?: string
}

function logEntries(markdown: string): LogEntry[] {
  const sections = markdown.split(/^## /mu).slice(1)
  return sections.flatMap((section, index) => {
    const [heading] = section.split('\n', 1)
    const parts = /^(.*?) \| (.*?) \| (.*?)$/u.exec(heading ?? '')
    if (!parts) return []
    const field = (name: string) =>
      new RegExp(`^- ${name}：\x60([^\x60]*)\x60`, 'mu').exec(section)?.[1]
    const payload = (name: string) =>
      new RegExp(
        `^### ${name}\\n\\n\\x60{3}json\\n([\\s\\S]*?)\\n\\x60{3}`,
        'mu'
      ).exec(section)?.[1]
    return [
      {
        index,
        timestamp: parts[1]!,
        action: parts[2]!,
        status: parts[3]!,
        stage: field('阶段'),
        trigger: field('触发方式'),
        duration: field('耗时'),
        retryCount: field('重试次数'),
        processor: field('处理器'),
        prompt: field('提示词'),
        error: field('错误摘要'),
        request: payload('request'),
        response: payload('response'),
      },
    ]
  })
}

async function feedItem(
  repository: SingleTableRepository,
  row: ContentRow,
  sources: SingleTableConfig['sources']['sources']
) {
  const source = sources.find(
    (candidate) => candidate.id === row.source_account_id
  )
  const scores = Object.fromEntries(
    Object.entries(scoreNames).flatMap(([column, name]) => {
      const level = row[`${column}_level`]
      return typeof level === 'number'
        ? [[name, { level, reason: row[`${column}_reason`] }]]
        : []
    })
  )
  const chinese = await repository.readBody(row.id, 'zh')
  const english = await repository.readBody(row.id, 'en')
  return {
    id: row.id,
    title: row.title,
    chineseTitle: row.chinese_title ?? undefined,
    url: row.canonical_url ?? undefined,
    publishedAt: row.published_at ?? undefined,
    discoveredAt: row.discovered_at,
    firstInflowAt: row.first_inflow_at,
    originalFormat: row.original_format,
    externalContentId: row.external_content_id,
    processStage: row.processing_stage,
    retryCount: row.retry_count,
    lastError: row.last_error,
    lastProcessedAt: row.last_processed_at,
    analyzedAt: row.analyzed_at,
    body: english ?? chinese ?? '',
    hasEnglishBody: Boolean(english),
    summary: row.summary ?? '',
    keywordsText: row.keywords_text,
    valueSummary: row.value_summary ?? undefined,
    originalLanguage: row.original_language,
    chineseTranslation: row.original_language === 'en' ? chinese : undefined,
    translatedToChinese: Boolean(row.translated_to_chinese),
    topics: arrayValue(row.keywords_json),
    scores,
    totalScore: row.total_score,
    recommendation: row.recommendation,
    kind: row.content_kind,
    source: source
      ? {
          id: source.id,
          name: source.account_name,
          type: source.platform,
          language: source.language,
        }
      : {
          id: row.source_account_id,
          name: row.source_account_name,
          type: row.source_platform,
          language: row.original_language,
        },
    images: arrayValue(row.images_json),
    quotedPost: row.quoted_post_json
      ? JSON.parse(String(row.quoted_post_json))
      : undefined,
    repostedBy: row.reposted_by_json
      ? JSON.parse(String(row.reposted_by_json))
      : undefined,
    video:
      row.video_duration_seconds ||
      row.video_thumbnail_url ||
      row.video_media_url
        ? {
            durationSeconds: row.video_duration_seconds,
            thumbnailUrl: row.video_thumbnail_url,
            mediaUrl: row.video_media_url,
          }
        : undefined,
    processStatus: row.process_status,
    originalStatus: row.original_status,
    read: Boolean(row.read),
    utilizationActions: arrayValue(row.utilization_actions_json),
    junk: {
      isJunk: Boolean(row.is_junk),
      source: row.junk_source,
      reason: row.junk_reason ?? undefined,
      note: row.junk_note ?? undefined,
    },
    interaction: row.interaction_captured_at
      ? {
          capturedAt: row.interaction_captured_at,
          views: row.views,
          likes: row.likes,
          comments: row.comments,
          shares: row.shares,
          saves: row.saves,
        }
      : undefined,
    analysis: row.analysis_provider
      ? {
          provider: row.analysis_provider,
          model: row.analysis_model,
          profileVersionId: row.analysis_profile_version_id,
          ruleVersion: row.analysis_rule_version,
        }
      : undefined,
  }
}

async function bodyOf(
  request: IncomingMessage
): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
    if (body.length > 1_000_000) throw new Error('Request is too large')
  }
  const parsed = JSON.parse(body || '{}') as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('JSON object required')
  return parsed as Record<string, unknown>
}

function send(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown
): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

export function createSingleTableServiceApp(options: {
  dataRoot: string
  configRoot: string
  secretFile?: string
  promptsRoot?: string
  webRoot?: string
  gateway?: SingleTableModelGateway
  providerFetch?: typeof fetch
}) {
  let repository: SingleTableRepository | undefined
  let server: Server | undefined
  const retrying = new Set<string>()
  return {
    async start(address: { host: string; port: number }) {
      if (server) throw new Error('Service is already running')
      if (!['127.0.0.1', '::1'].includes(address.host))
        throw new Error('Single-table service only binds locally')
      repository = await SingleTableRepository.open(options.dataRoot)
      const activeRepository = repository
      server = createServer((request, response) => {
        void (async () => {
          const url = new URL(request.url ?? '/', `http://${address.host}`)
          const method = request.method ?? 'GET'
          if (method === 'GET' && url.pathname === '/health')
            return send(response, 200, {
              service: 'qiushuiai-airadar-single-table',
              status: 'ready',
            })
          const logMatch = /^\/api\/contents\/([^/]+)\/logs$/u.exec(
            url.pathname
          )
          if (method === 'GET' && logMatch) {
            const id = decodeURIComponent(logMatch[1]!)
            const markdown = await activeRepository.readLog(id)
            if (markdown === undefined)
              return send(response, 404, { error: 'not_found' })
            const entries = logEntries(markdown)
            const entryIndex = url.searchParams.get('entry')
            if (entryIndex !== null) {
              const index = Number(entryIndex)
              if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= entries.length
              )
                return send(response, 404, { error: 'not_found' })
              return send(response, 200, { item: entries[index] })
            }
            return send(response, 200, {
              items: entries
                .map(({ request, response, ...entry }) => entry)
                .reverse(),
            })
          }
          if (
            method === 'GET' &&
            (url.pathname === '/api/contents' || url.pathname === '/api/daily')
          ) {
            const config = await loadSingleTableConfig(options.configRoot)
            const rows = activeRepository
              .search({
                keyword: url.searchParams.get('keyword') ?? undefined,
                isJunk: url.pathname === '/api/daily' ? false : undefined,
                limit: 500,
              })
              .filter(
                (row) =>
                  url.pathname !== '/api/daily' ||
                  (row.process_status === 'completed' &&
                    row.recommendation !== 'none')
              )
            return send(response, 200, {
              items: await Promise.all(
                rows.map((row) =>
                  feedItem(activeRepository, row, config.sources.sources)
                )
              ),
            })
          }
          if (method === 'GET' && url.pathname === '/api/sources') {
            const config = await loadSingleTableConfig(options.configRoot)
            const state = await loadSourceState(options.configRoot)
            return send(response, 200, {
              items: config.sources.sources.map((source) =>
                sourceItem(
                  source,
                  state.sources[source.id]?.enabled_override ?? source.enabled
                )
              ),
            })
          }
          if (method === 'GET' && url.pathname === '/api/providers') {
            const config = await loadSingleTableConfig(options.configRoot)
            const reader = createFileSecretReader(
              options.secretFile ?? path.join(options.dataRoot, '.env')
            )
            const items = await Promise.all(
              providerDefinitions.map(async (provider) => {
                let configured = !('secretName' in provider)
                if ('secretName' in provider) {
                  try {
                    configured = Boolean(await reader.get(provider.secretName))
                  } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                      throw error
                  }
                }
                const preferred =
                  config.providers.platforms[
                    provider.sourceType as 'x' | 'youtube' | 'rss'
                  ].preferred === provider.id
                return {
                  id: provider.id,
                  name: provider.name,
                  sourceType: provider.sourceType,
                  priority: preferred ? 1 : 2,
                  preferred,
                  secretName:
                    'secretName' in provider ? provider.secretName : undefined,
                  health: { state: configured ? 'healthy' : 'unconfigured' },
                  secretStatus:
                    'secretName' in provider ? { configured } : undefined,
                }
              })
            )
            return send(response, 200, { items })
          }
          if (method === 'GET' && url.pathname === '/api/runtime')
            return send(response, 200, {
              mode: 'single-table',
              ...activeRepository.runtimeOverview(),
            })
          if (method === 'GET' && url.pathname === '/api/config') {
            const files = await Promise.all(
              editableConfigFileNames.map(async (name) => ({
                name,
                content: await readFile(
                  path.join(options.configRoot, name),
                  'utf8'
                ),
              }))
            )
            return send(response, 200, { mode: 'file', files })
          }
          if (['POST', 'PUT', 'DELETE'].includes(method)) {
            const origin = request.headers.origin
            if (
              origin &&
              !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin)
            )
              return send(response, 403, { error: 'origin_not_allowed' })
            if (
              !request.headers['content-type']?.startsWith('application/json')
            )
              return send(response, 415, { error: 'json_required' })
            if (method === 'POST' && url.pathname === '/api/sources') {
              const body = await bodyOf(request)
              const source = sourceFromBody(body)
              const config = await loadSingleTableConfig(options.configRoot)
              if (
                config.sources.sources.some(
                  (candidate) => candidate.id === source.id
                )
              )
                return send(response, 409, {
                  error: 'source_id_exists',
                  message: '信源 ID 已存在。',
                })
              await saveSourcesConfig(options.configRoot, [
                ...config.sources.sources,
                source,
              ])
              return send(response, 201, {
                source: sourceItem(source, source.enabled),
              })
            }
            const sourceCrud = /^\/api\/sources\/([^/]+)$/u.exec(url.pathname)
            if (sourceCrud && (method === 'PUT' || method === 'DELETE')) {
              const id = decodeURIComponent(sourceCrud[1]!)
              const config = await loadSingleTableConfig(options.configRoot)
              const index = config.sources.sources.findIndex(
                (candidate) => candidate.id === id
              )
              if (index < 0)
                return send(response, 404, { error: 'source_not_found' })
              const state = await loadSourceState(options.configRoot)
              if (method === 'DELETE') {
                await bodyOf(request)
                await saveSourcesConfig(
                  options.configRoot,
                  config.sources.sources.filter(
                    (candidate) => candidate.id !== id
                  )
                )
                delete state.sources[id]
                await saveSourceState(options.configRoot, state)
                return send(response, 200, { deleted: id })
              }
              const source = sourceFromBody({
                ...(await bodyOf(request)),
                id,
              })
              const next = [...config.sources.sources]
              next[index] = source
              await saveSourcesConfig(options.configRoot, next)
              delete state.sources[id]
              await saveSourceState(options.configRoot, state)
              return send(response, 200, {
                source: sourceItem(source, source.enabled),
              })
            }
            const providerMutation = /^\/api\/providers\/([^/]+)$/u.exec(
              url.pathname
            )
            if (providerMutation && method === 'PUT') {
              const id = decodeURIComponent(providerMutation[1]!)
              const definition = providerDefinitions.find(
                (provider) => provider.id === id
              )
              if (!definition)
                return send(response, 404, { error: 'provider_not_found' })
              const body = await bodyOf(request)
              const config = await loadSingleTableConfig(options.configRoot)
              if (body.preferred === true) {
                if (
                  definition.sourceType === 'x' &&
                  (id === 'twitterapi.io' || id === 'tikhub-x')
                )
                  config.providers.platforms.x.preferred = id
                if (
                  definition.sourceType === 'youtube' &&
                  (id === 'youtube-data-api' || id === 'tikhub-youtube')
                )
                  config.providers.platforms.youtube.preferred = id
                if (definition.sourceType === 'rss' && id === 'native-rss')
                  config.providers.platforms.rss.preferred = id
                await saveProvidersConfig(options.configRoot, config.providers)
              }
              if ('secretName' in definition) {
                if (typeof body.secret === 'string' && body.secret.trim())
                  await updateFileSecret(
                    options.secretFile ?? path.join(options.dataRoot, '.env'),
                    definition.secretName,
                    body.secret.trim()
                  )
                if (body.clearSecret === true)
                  await updateFileSecret(
                    options.secretFile ?? path.join(options.dataRoot, '.env'),
                    definition.secretName,
                    undefined
                  )
              }
              return send(response, 200, { saved: id })
            }
            const providerTest = /^\/api\/providers\/([^/]+)\/test$/u.exec(
              url.pathname
            )
            if (providerTest && method === 'POST') {
              await bodyOf(request)
              const id = decodeURIComponent(providerTest[1]!)
              const definition = providerDefinitions.find(
                (provider) => provider.id === id
              )
              if (!definition)
                return send(response, 404, { error: 'provider_not_found' })
              const config = await loadSingleTableConfig(options.configRoot)
              const source = config.sources.sources.find(
                (candidate) => candidate.platform === definition.sourceType
              )
              if (!source)
                return send(response, 409, {
                  error: 'provider_has_no_source',
                  message: '请先为这个平台添加一个信源。',
                })
              const reader = createFileSecretReader(
                options.secretFile ?? path.join(options.dataRoot, '.env')
              )
              const credential = async (name: string) =>
                reader.get(name).catch((error: unknown) => {
                  if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                    return undefined
                  throw error
                })
              try {
                const provider = createSingleTableSourceProvider({
                  tikHubToken: await credential('TIKHUB_API_KEY'),
                  twitterApiKey: await credential('TWITTERAPI_IO_KEY'),
                  youtubeApiKey: await credential('YOUTUBE_API_KEY'),
                  fetch: options.providerFetch,
                  providerOrder:
                    definition.sourceType === 'x' ||
                    definition.sourceType === 'youtube'
                      ? { [definition.sourceType]: [id] }
                      : undefined,
                })
                const page = await provider.discover(source, 3)
                return send(response, 200, {
                  status: 'succeeded',
                  providerId: page.providerId,
                  items: page.items.map((item) => ({
                    title: item.title,
                    url: item.url,
                  })),
                })
              } catch (error) {
                return send(response, 502, {
                  status: 'failed',
                  message:
                    error instanceof Error ? error.message : '远端连接失败。',
                })
              }
            }
            const configMutation = /^\/api\/config\/files\/([^/]+)$/u.exec(
              url.pathname
            )
            if (configMutation && method === 'PUT') {
              const name = decodeURIComponent(configMutation[1]!)
              if (
                !editableConfigFileNames.includes(
                  name as (typeof editableConfigFileNames)[number]
                )
              )
                return send(response, 404, { error: 'config_not_found' })
              const body = await bodyOf(request)
              if (typeof body.content !== 'string')
                return send(response, 400, {
                  error: 'config_content_required',
                })
              await saveEditableConfigFile(
                options.configRoot,
                name as (typeof editableConfigFileNames)[number],
                body.content
              )
              return send(response, 200, { saved: name })
            }
            const sourceMatch = /^\/api\/sources\/([^/]+)\/status$/u.exec(
              url.pathname
            )
            if (sourceMatch) {
              const id = decodeURIComponent(sourceMatch[1]!)
              const body = await bodyOf(request)
              if (body.status !== 'enabled' && body.status !== 'disabled')
                return send(response, 400, {
                  error: 'Only enabled and disabled are supported in file mode',
                })
              const config = await loadSingleTableConfig(options.configRoot)
              const source = config.sources.sources.find(
                (candidate) => candidate.id === id
              )
              if (!source)
                return send(response, 404, { error: 'source_not_found' })
              const state = await loadSourceState(options.configRoot)
              state.sources[id] = {
                ...state.sources[id],
                enabled_override: body.status === 'enabled',
              }
              await saveSourceState(options.configRoot, state)
              return send(response, 200, {
                source: {
                  id,
                  name: source.account_name,
                  type: source.platform,
                  externalIdentity: source.external_identity,
                  language: source.language,
                  status: body.status,
                },
              })
            }
            const sourceTest = /^\/api\/sources\/([^/]+)\/test-fetch$/u.exec(
              url.pathname
            )
            if (sourceTest) {
              await bodyOf(request)
              const id = decodeURIComponent(sourceTest[1]!)
              const config = await loadSingleTableConfig(options.configRoot)
              const source = config.sources.sources.find(
                (candidate) => candidate.id === id
              )
              if (!source)
                return send(response, 404, { error: 'source_not_found' })
              const reader = createFileSecretReader(
                options.secretFile ?? path.join(options.dataRoot, '.env')
              )
              const credential = async (name: string) => {
                try {
                  return await reader.get(name)
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                    return undefined
                  throw error
                }
              }
              const provider = createSingleTableSourceProvider({
                tikHubToken: await credential('TIKHUB_API_KEY'),
                twitterApiKey: await credential('TWITTERAPI_IO_KEY'),
                youtubeApiKey: await credential('YOUTUBE_API_KEY'),
                fetch: options.providerFetch,
                providerOrder:
                  source.platform === 'x' || source.platform === 'youtube'
                    ? {
                        [source.platform]: providerOrder(
                          config,
                          source.platform
                        ),
                      }
                    : undefined,
              })
              try {
                const page = await provider.discover(source, 3)
                return send(response, 200, {
                  status: 'succeeded',
                  providerId: page.providerId,
                  items: page.items.map((item) => ({
                    title: item.title,
                    url: item.url,
                    publishedAt: item.publishedAt,
                  })),
                })
              } catch {
                return send(response, 502, {
                  status: 'failed',
                  message: '远端试抓失败，请检查凭据、余额和供应商状态。',
                })
              }
            }
            if (url.pathname === '/api/contents/batch') {
              const body = await bodyOf(request)
              if (
                !Array.isArray(body.ids) ||
                body.ids.length === 0 ||
                body.ids.length > 100 ||
                body.ids.some((id) => typeof id !== 'string')
              )
                return send(response, 400, { error: 'invalid_content_ids' })
              if (
                body.operation !== 'mark-read' &&
                body.operation !== 'mark-unread'
              )
                return send(response, 400, {
                  error: 'unsupported_batch_operation',
                })
              for (const id of body.ids)
                activeRepository.setRead(
                  String(id),
                  body.operation === 'mark-read'
                )
              return send(response, 200, { updated: body.ids.length })
            }
            const retryMatch = /^\/api\/contents\/([^/]+)\/retry$/u.exec(
              url.pathname
            )
            if (retryMatch) {
              await bodyOf(request)
              const id = decodeURIComponent(retryMatch[1]!)
              const row = activeRepository.getById(id)
              if (!row)
                return send(response, 404, { error: 'content_not_found' })
              if (retrying.has(id))
                return send(response, 409, { error: 'retry_already_running' })
              if (
                row.process_status !== 'failed' &&
                row.process_status !== 'waiting-manual-transcription'
              )
                return send(response, 409, { error: 'content_not_retryable' })
              retrying.add(id)
              try {
                const config = await loadSingleTableConfig(options.configRoot)
                const source = config.sources.sources.find(
                  (item) => item.id === row.source_account_id
                )
                if (!source)
                  return send(response, 409, { error: 'source_not_configured' })
                const nonArticleReason =
                  row.source_platform === 'x' &&
                  row.content_kind === 'article' &&
                  row.canonical_url
                    ? classifyNonArticlePage(String(row.canonical_url))
                    : undefined
                if (nonArticleReason) {
                  const excluded = await activeRepository.setRuleJunk(
                    id,
                    nonArticleReason
                  )
                  return send(response, 200, {
                    item: await feedItem(
                      activeRepository,
                      excluded,
                      config.sources.sources
                    ),
                  })
                }
                const reader = createFileSecretReader(
                  options.secretFile ?? path.join(options.dataRoot, '.env')
                )
                const credential = async (name: string) => {
                  try {
                    return await reader.get(name)
                  } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                      return undefined
                    throw error
                  }
                }
                const provider = createSingleTableSourceProvider({
                  tikHubToken: await credential('TIKHUB_API_KEY'),
                  twitterApiKey: await credential('TWITTERAPI_IO_KEY'),
                  youtubeApiKey: await credential('YOUTUBE_API_KEY'),
                  fetch: options.providerFetch,
                  providerOrder:
                    source.platform === 'x' || source.platform === 'youtube'
                      ? {
                          [source.platform]: providerOrder(
                            config,
                            source.platform
                          ),
                        }
                      : undefined,
                })
                const originalBody = await activeRepository.readBody(
                  id,
                  row.original_language === 'zh' ? 'zh' : 'en'
                )
                let original: import('@qiushuiai-airadar/runtime').OriginalContent
                let capturedCalls: import('@qiushuiai-airadar/runtime').LogEvent[] =
                  []
                if (originalBody) {
                  original = {
                    platform: String(row.source_platform),
                    sourceType: String(row.source_type),
                    sourceAccountId: String(row.source_account_id),
                    sourceAccountName: String(row.source_account_name),
                    externalContentId: row.external_content_id as
                      string | undefined,
                    canonicalUrl: row.canonical_url as string | undefined,
                    title: row.title,
                    originalTitle: row.original_title ?? undefined,
                    body: originalBody,
                    kind: row.content_kind,
                    format:
                      row.original_format as import('@qiushuiai-airadar/runtime').OriginalContent['format'],
                    language: row.original_language === 'zh' ? 'zh' : 'en',
                    publishedAt: row.published_at as string | undefined,
                  }
                } else {
                  const page = await provider.discover(source)
                  const item = page.items.find(
                    (candidate) =>
                      candidate.externalId === row.external_content_id ||
                      candidate.url === row.canonical_url
                  )
                  if (!item)
                    return send(response, 409, {
                      error: 'original_not_in_current_source_page',
                    })
                  const resolved = await provider.resolve(source, item)
                  original = resolved.original
                  capturedCalls = [
                    {
                      action: 'discover',
                      stage: 'discovered',
                      status: 'succeeded',
                      trigger: 'manual-retry',
                      request: page.request,
                      response: page.response,
                    },
                    ...(resolved.calls ?? []).map((call) => ({
                      ...call,
                      trigger: 'manual-retry' as const,
                    })),
                  ]
                }
                await activeRepository.appendLog(id, {
                  action: 'manual-retry',
                  stage: 'discovered',
                  status: 'succeeded',
                  trigger: 'manual-retry',
                  request: { contentId: id },
                  response: { accepted: true },
                })
                const gateway =
                  options.gateway ??
                  createSingleTableCodexGateway(
                    (await credential('CODEX_AUTH_PATH')) ??
                      path.join(homedir(), '.codex', 'auth.json'),
                    config.analysis.model.name
                  )
                const completed = await processSingleTableContent({
                  repository: activeRepository,
                  gateway,
                  promptsRoot:
                    options.promptsRoot ??
                    path.resolve(
                      import.meta.dirname,
                      '../../../docs/prompts/single-table-content'
                    ),
                  original,
                  capturedCalls,
                  profile: config.profile,
                  profileVersion: String(config.profile.version),
                  scoring: {
                    weights: config.analysis.scoring.weights,
                    coreThreshold: config.analysis.scoring.core_threshold,
                    exploreThreshold: config.analysis.scoring.explore_threshold,
                    coreMinLevels: config.analysis.scoring.core_min_levels,
                    exploreMinLevels:
                      config.analysis.scoring.explore_min_levels,
                  },
                  longContentMinChars:
                    config.analysis.summarization.long_content_min_chars,
                  translationMinimumTotalScore:
                    config.analysis.translation.minimum_total_score,
                })
                return send(response, 200, {
                  item: await feedItem(
                    activeRepository,
                    completed,
                    config.sources.sources
                  ),
                })
              } catch {
                return send(response, 502, {
                  error: 'manual_retry_failed',
                  message: '重试失败，详情见该内容的执行日志。',
                })
              } finally {
                retrying.delete(id)
              }
            }
            const match =
              /^\/api\/contents\/([^/]+)\/(read|actions|junk)$/u.exec(
                url.pathname
              )
            if (match) {
              const id = decodeURIComponent(match[1]!)
              const body = await bodyOf(request)
              if (match[2] === 'read')
                activeRepository.setRead(id, body.read === true)
              if (match[2] === 'actions') {
                const allowed = new Set([
                  'favorite',
                  'card',
                  'video',
                  'article',
                  'project',
                ])
                if (
                  !Array.isArray(body.actions) ||
                  body.actions.some((action) => !allowed.has(String(action)))
                )
                  throw new Error('Invalid utilization action')
                activeRepository.setUtilizationActions(
                  id,
                  body.actions as Array<
                    'favorite' | 'card' | 'video' | 'article' | 'project'
                  >
                )
              }
              if (match[2] === 'junk')
                await activeRepository.setManualJunk(
                  id,
                  body.isJunk === true,
                  typeof body.reason === 'string' ? body.reason : undefined,
                  typeof body.note === 'string' ? body.note : undefined
                )
              const config = await loadSingleTableConfig(options.configRoot)
              return send(response, 200, {
                item: await feedItem(
                  activeRepository,
                  activeRepository.getById(id)!,
                  config.sources.sources
                ),
              })
            }
          }
          if (
            options.webRoot &&
            (method === 'GET' || method === 'HEAD') &&
            !url.pathname.startsWith('/api/')
          ) {
            const root = path.resolve(options.webRoot)
            const requested = path.resolve(
              root,
              `.${decodeURIComponent(url.pathname)}`
            )
            if (
              !requested.startsWith(`${root}${path.sep}`) &&
              requested !== root
            )
              return send(response, 403, { error: 'forbidden' })
            const extension = path.extname(requested)
            const file = extension ? requested : path.join(root, 'index.html')
            try {
              const body = await readFile(file)
              const types: Record<string, string> = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.ico': 'image/x-icon',
                '.woff2': 'font/woff2',
              }
              response.writeHead(200, {
                'content-type':
                  types[path.extname(file)] ?? 'application/octet-stream',
                'x-content-type-options': 'nosniff',
                'cache-control': 'no-cache',
              })
              response.end(method === 'HEAD' ? undefined : body)
              return
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error
            }
          }
          return send(response, 404, { error: 'not_found' })
        })().catch((error: unknown) => {
          if (!response.headersSent)
            send(response, 400, {
              error: 'request_failed',
              message:
                error instanceof Error ? error.message : '请求处理失败。',
            })
          else response.end()
        })
      })
      try {
        await new Promise<void>((resolve, reject) => {
          server?.once('error', reject)
          server?.listen(address.port, address.host, resolve)
        })
      } catch (error) {
        server = undefined
        repository.close()
        repository = undefined
        throw error
      }
      const bound = server.address()
      if (!bound || typeof bound === 'string')
        throw new Error('Invalid listen address')
      return { host: address.host, port: bound.port }
    },
    async stop() {
      const current = server
      server = undefined
      if (current)
        await new Promise<void>((resolve) => current.close(() => resolve()))
      repository?.close()
      repository = undefined
    },
  }
}
