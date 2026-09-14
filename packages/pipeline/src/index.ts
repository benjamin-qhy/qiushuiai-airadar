import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { Readability } from '@mozilla/readability'
import {
  createModels,
  Type,
  type Api,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  type Model,
  type Models,
} from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { XMLParser } from 'fast-xml-parser'
import { parseHTML } from 'linkedom'
import { z } from 'zod'

import type { AnalysisRecord, RuntimeRepository } from '@airadar/runtime'

type Fetcher = typeof globalThis.fetch

const levelSchema = z.number().int().min(1).max(5)
const scoreSchema = z
  .object({ level: levelSchema, reason: z.string().min(1) })
  .strict()

export const analysisResultSchema = z
  .object({
    summary: z.string().min(20),
    topics: z.array(z.string().min(1)).min(1),
    scores: z
      .object({
        topicMatch: scoreSchema,
        substance: scoreSchema,
        credibility: scoreSchema,
        novelty: scoreSchema,
        actionability: scoreSchema,
        workValue: scoreSchema,
        clarity: scoreSchema,
      })
      .strict(),
    spam: z
      .object({
        isSpam: z.boolean(),
        reason: z.preprocess(
          (value) => (value === null ? undefined : value),
          z.string().min(1).optional()
        ),
      })
      .strict()
      .superRefine((spam, context) => {
        if (spam.isSpam && !spam.reason) {
          context.addIssue({
            code: 'custom',
            message: 'Spam reason is required when content is spam',
            path: ['reason'],
          })
        }
      }),
  })
  .strict()

export type AnalysisResult = z.infer<typeof analysisResultSchema>
export type Recommendation = 'core' | 'explore' | 'none'

export interface RssItem {
  externalId: string
  title: string
  canonicalUrl: string
  publishedAt?: string
}

export interface RssDiscoveryBatch {
  items: RssItem[]
  nextCursor?: string
  observedExternalIds: string[]
  rawResponse: string
}

export interface ModelEvidence {
  provider: string
  model: string
  durationMs: number
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    costUsd: number
  }
}

export interface ModelGateway {
  readonly provider: string
  readonly model: string
  auditInput(input: { title: string; body: string; profile: string }): unknown
  analyze(input: { title: string; body: string; profile: string }): Promise<{
    result: AnalysisResult
    evidence: ModelEvidence
    rawResponse?: unknown
  }>
}

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly evidence: ModelEvidence,
    readonly rawResponse?: unknown
  ) {
    super(message)
    this.name = 'ModelGatewayError'
  }
}

const codexProviderId = 'openai-codex'
export const rssAcceptanceModel = 'gpt-5.3-codex-spark'
const analysisPromptVersion = 'rss-analysis-v1'

interface CodexAuthFile {
  auth_mode?: unknown
  tokens?: {
    access_token?: unknown
    refresh_token?: unknown
    account_id?: unknown
  }
}

function jwtExpiresAt(token: string): number {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Codex access token is not a JWT')
  const decoded = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8')
  ) as { exp?: unknown }
  if (typeof decoded.exp !== 'number') {
    throw new Error('Codex access token has no expiry')
  }
  return decoded.exp * 1_000
}

export function createReadOnlyCodexCredentialStore(
  authPath: string
): CredentialStore {
  let memoryCredential: Credential | undefined
  let loaded = false
  const load = async (): Promise<Credential | undefined> => {
    if (loaded) return memoryCredential
    const parsed = JSON.parse(await readFile(authPath, 'utf8')) as CodexAuthFile
    const access = parsed.tokens?.access_token
    const refresh = parsed.tokens?.refresh_token
    const accountId = parsed.tokens?.account_id
    if (
      parsed.auth_mode !== 'chatgpt' ||
      typeof access !== 'string' ||
      typeof refresh !== 'string'
    ) {
      throw new Error('Codex ChatGPT OAuth credentials are unavailable')
    }
    memoryCredential = {
      type: 'oauth',
      access,
      refresh,
      expires: jwtExpiresAt(access),
      ...(typeof accountId === 'string' ? { accountId } : {}),
    }
    loaded = true
    return memoryCredential
  }
  return {
    read: async (providerId) =>
      providerId === codexProviderId ? load() : undefined,
    list: async (): Promise<readonly CredentialInfo[]> =>
      (await load()) ? [{ providerId: codexProviderId, type: 'oauth' }] : [],
    modify: async (providerId, update) => {
      if (providerId !== codexProviderId) return undefined
      memoryCredential = (await update(await load())) ?? memoryCredential
      return memoryCredential
    },
    delete: async (providerId) => {
      if (providerId === codexProviderId) {
        loaded = true
        memoryCredential = undefined
      }
    },
  }
}

export function createCodexPiGateway(
  authPath: string,
  modelId = rssAcceptanceModel
): ModelGateway {
  const models = createModels({
    credentials: createReadOnlyCodexCredentialStore(authPath),
  })
  models.setProvider(openaiCodexProvider())
  const model = models.getModel(codexProviderId, modelId)
  if (!model) throw new Error(`Pi model is unavailable: ${modelId}`)
  return createPiModelGateway(models, model)
}

const trackingParameters = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
])

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function canonicalizeArticleUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase()
    if (
      normalizedKey.startsWith('utm_') ||
      trackingParameters.has(normalizedKey)
    ) {
      url.searchParams.delete(key)
    }
  }
  url.searchParams.sort()
  url.hostname = url.hostname.toLowerCase()
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/u, '')
  return url.toString().replace(/\?$/u, '').replace(/\/$/u, '')
}

function scalar(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim() || undefined
  }
  if (value && typeof value === 'object' && '#text' in value) {
    return scalar((value as { '#text': unknown })['#text'])
  }
  return undefined
}

function toTimestamp(value: unknown): string | undefined {
  const text = scalar(value)
  if (!text) return undefined
  const timestamp = new Date(text)
  return Number.isNaN(timestamp.valueOf()) ? undefined : timestamp.toISOString()
}

export class RssAdapter {
  constructor(private readonly fetcher: Fetcher = globalThis.fetch) {}

  async discover(input: {
    feedUrl: string
    cursor?: string
    limit: number
    now?: Date
    incremental?: boolean
    isSeen?: (externalId: string, canonicalUrl: string) => boolean
    isHistoricalRetry?: (externalId: string) => boolean
  }): Promise<RssDiscoveryBatch> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      throw new Error('RSS discovery limit must be between 1 and 100')
    }
    const response = await this.fetcher(input.feedUrl, {
      headers: { accept: 'application/rss+xml, application/xml, text/xml' },
      redirect: 'follow',
    })
    if (!response.ok) {
      throw new Error(`RSS request failed with HTTP ${response.status}`)
    }
    const rawResponse = await response.text()
    const parsed = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      trimValues: true,
    }).parse(rawResponse) as {
      rss?: { channel?: { item?: unknown } }
      feed?: { entry?: unknown }
    }
    const rawItems = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? []
    const entries = Array.isArray(rawItems) ? rawItems : [rawItems]
    const incremental = input.incremental ?? Boolean(input.cursor)
    const unseenItems: RssItem[] = []
    const observedExternalIds: string[] = []
    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue
      const entry = rawEntry as Record<string, unknown>
      const linkValues = Array.isArray(entry.link) ? entry.link : [entry.link]
      const linkValue =
        linkValues.find((candidate) => {
          if (!candidate || typeof candidate !== 'object') return true
          const relation = scalar(
            (candidate as Record<string, unknown>)['@_rel']
          )
          return !relation || relation === 'alternate'
        }) ?? linkValues[0]
      const link =
        scalar(linkValue) ??
        (linkValue && typeof linkValue === 'object'
          ? scalar((linkValue as Record<string, unknown>)['@_href'])
          : undefined)
      const title = scalar(entry.title)
      if (!link || !title) continue
      const canonicalUrl = canonicalizeArticleUrl(link)
      const externalId = scalar(entry.guid) ?? scalar(entry.id) ?? canonicalUrl
      observedExternalIds.push(externalId)
      if (
        input.isSeen?.(externalId, canonicalUrl) ||
        (!input.isSeen && externalId === input.cursor)
      ) {
        continue
      }
      const publishedAt = toTimestamp(
        entry.pubDate ?? entry.published ?? entry.updated
      )
      if (
        !incremental &&
        !input.isHistoricalRetry?.(externalId) &&
        (!publishedAt ||
          Date.parse(publishedAt) <
            (input.now ?? new Date()).valueOf() - 7 * 24 * 60 * 60 * 1_000)
      ) {
        continue
      }
      unseenItems.push({
        externalId,
        title,
        canonicalUrl,
        publishedAt,
      })
    }
    const orderedItems = unseenItems.toSorted((left, right) => {
      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0
      return (
        leftTime - rightTime || left.externalId.localeCompare(right.externalId)
      )
    })
    const effectiveLimit = incremental ? input.limit : Math.min(input.limit, 20)
    const items = incremental
      ? orderedItems.slice(0, effectiveLimit)
      : orderedItems.slice(-effectiveLimit).reverse()
    return {
      items,
      nextCursor:
        (incremental ? items.at(-1) : items[0])?.externalId ??
        observedExternalIds[0] ??
        input.cursor,
      observedExternalIds,
      rawResponse,
    }
  }
}

export async function enrichArticle(
  url: string,
  fetcher: Fetcher = globalThis.fetch
): Promise<{ title: string; body: string; canonicalUrl: string }> {
  const response = await fetcher(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'AI-Radar/0.1 (+personal content reader)',
    },
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`Article request failed with HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType && !contentType.includes('html')) {
    throw new Error(`Article response is not HTML: ${contentType}`)
  }
  const html = await response.text()
  const finalUrl = response.url || url
  const { document } = parseHTML(html)
  const article = new Readability(document as unknown as Document, {
    charThreshold: 200,
  }).parse()
  const body = article?.textContent?.replace(/\s+/gu, ' ').trim() ?? ''
  if (body.length < 200) {
    throw new Error('Could not extract a complete article body')
  }
  return {
    title:
      article?.title?.trim() || document.title.trim() || 'Untitled article',
    body,
    canonicalUrl: canonicalizeArticleUrl(finalUrl),
  }
}

const scoreWeights = {
  topicMatch: 0.2,
  substance: 0.15,
  credibility: 0.15,
  novelty: 0.1,
  actionability: 0.15,
  workValue: 0.15,
  clarity: 0.1,
} as const

export function calculateRecommendation(input: unknown): {
  totalScore: number
  recommendation: Recommendation
} {
  const result = analysisResultSchema.parse(input)
  const totalScore = Math.round(
    Object.entries(scoreWeights).reduce(
      (total, [key, weight]) =>
        total +
        (result.scores[key as keyof typeof scoreWeights].level - 1) *
          25 *
          weight,
      0
    )
  )
  const scores = result.scores
  let recommendation: Recommendation = 'none'
  if (!result.spam.isSpam) {
    if (
      totalScore >= 80 &&
      scores.topicMatch.level === 5 &&
      scores.substance.level >= 3 &&
      scores.credibility.level >= 3
    ) {
      recommendation = 'core'
    } else if (
      totalScore >= 60 &&
      scores.topicMatch.level >= 4 &&
      scores.substance.level >= 3 &&
      scores.credibility.level >= 3
    ) {
      recommendation = 'explore'
    }
  }
  return { totalScore, recommendation }
}

const analysisTool = {
  name: 'submit_analysis',
  description: '提交一条内容的完整中文分析结果',
  parameters: Type.Object(
    {
      summary: Type.String({ minLength: 20 }),
      topics: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      scores: Type.Object({
        topicMatch: Type.Object({
          level: Type.Integer({ minimum: 1, maximum: 5 }),
          reason: Type.String(),
        }),
        substance: Type.Object({
          level: Type.Integer({ minimum: 1, maximum: 5 }),
          reason: Type.String(),
        }),
        credibility: Type.Object({
          level: Type.Integer({ minimum: 1, maximum: 5 }),
          reason: Type.String(),
        }),
        novelty: Type.Object({
          level: Type.Integer({ minimum: 1, maximum: 5 }),
          reason: Type.String(),
        }),
        actionability: Type.Object({
          level: Type.Integer({ minimum: 1, maximum: 5 }),
          reason: Type.String(),
        }),
        workValue: Type.Object({
          level: Type.Integer({ minimum: 1, maximum: 5 }),
          reason: Type.String(),
        }),
        clarity: Type.Object({
          level: Type.Integer({ minimum: 1, maximum: 5 }),
          reason: Type.String(),
        }),
      }),
      spam: Type.Object({
        isSpam: Type.Boolean(),
        reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      }),
    },
    { additionalProperties: false }
  ),
  constrainedSampling: { type: 'json_schema', strict: 'prefer' } as const,
}

export function createPiModelGateway(
  models: Models,
  model: Model<Api>
): ModelGateway {
  const requestFor = (input: {
    title: string
    body: string
    profile: string
  }) => ({
    context: {
      systemPrompt:
        '你是个人内容分析器。必须只调用 submit_analysis 一次。根据完整正文和个人画像给出中文摘要、主题、七项1到5档评分与垃圾判断。不要把平台热度作为加分。',
      messages: [
        {
          role: 'user' as const,
          content: `个人画像：\n${input.profile}\n\n标题：${input.title}\n\n完整正文：\n${input.body}`,
          timestamp: 0,
        },
      ],
      tools: [analysisTool],
    },
    options: { reasoning: 'low' as const, maxTokens: 2_500, maxRetries: 0 },
  })
  return {
    provider: model.provider,
    model: model.id,
    auditInput: requestFor,
    async analyze(input) {
      const started = Date.now()
      const request = requestFor(input)
      const message = await models.completeSimple(
        model,
        request.context,
        request.options
      )
      const evidence: ModelEvidence = {
        provider: message.provider,
        model: message.model,
        durationMs: Date.now() - started,
        usage: {
          inputTokens: message.usage.input,
          outputTokens: message.usage.output,
          cacheReadTokens: message.usage.cacheRead,
          cacheWriteTokens: message.usage.cacheWrite,
          costUsd: message.usage.cost.total,
        },
      }
      const rawResponse = {
        provider: message.provider,
        model: message.model,
        stopReason: message.stopReason,
        errorMessage: message.errorMessage,
        content: message.content,
        usage: message.usage,
      }
      if (message.stopReason === 'error') {
        throw new ModelGatewayError(
          message.errorMessage || 'Pi model request failed',
          evidence,
          rawResponse
        )
      }
      const submission = message.content.find(
        (block) => block.type === 'toolCall' && block.name === analysisTool.name
      )
      if (!submission || submission.type !== 'toolCall') {
        throw new ModelGatewayError(
          'Pi model did not return submit_analysis',
          evidence,
          rawResponse
        )
      }
      let result: AnalysisResult
      try {
        result = analysisResultSchema.parse(submission.arguments)
      } catch (error) {
        throw new ModelGatewayError(
          error instanceof Error ? error.message : String(error),
          evidence,
          rawResponse
        )
      }
      return {
        result,
        evidence,
        rawResponse,
      }
    },
  }
}

function contentId(url: string): string {
  return `rss-${sha256(`article:${url}`).slice(0, 32)}`
}

function discoveryId(sourceId: string, externalId: string): string {
  return `discovery-${sha256(`${sourceId}:${externalId}`).slice(0, 32)}`
}

function analysisFingerprint(input: {
  body: string
  profileVersionId: string
  ruleVersion: string
  modelRouteVersion: string
  promptVersion: string
}): string {
  return sha256(JSON.stringify(input))
}

const analysisLocks = new Map<string, Promise<void>>()

async function withAnalysisLock<T>(
  key: string,
  work: () => Promise<T>
): Promise<T> {
  const previous = analysisLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  analysisLocks.set(key, current)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (analysisLocks.get(key) === current) analysisLocks.delete(key)
  }
}

export async function analyzeStoredContent(
  repository: RuntimeRepository,
  contentId: string,
  options: {
    modelGateway: ModelGateway
    profile: string
    profileVersionId: string
    ruleVersion: string
    modelRouteVersion: string
    manual: boolean
  }
): Promise<AnalysisRecord> {
  return withAnalysisLock(`${repository.root}:${contentId}`, () =>
    analyzeStoredContentUnlocked(repository, contentId, options)
  )
}

async function analyzeStoredContentUnlocked(
  repository: RuntimeRepository,
  contentId: string,
  options: {
    modelGateway: ModelGateway
    profile: string
    profileVersionId: string
    ruleVersion: string
    modelRouteVersion: string
    manual: boolean
  }
): Promise<AnalysisRecord> {
  const content = repository.getContent(contentId)
  if (!content) throw new Error(`Content does not exist: ${contentId}`)
  if (!content.body.trim() || content.enrichmentStatus !== 'succeeded') {
    throw new Error('Content is not completely enriched')
  }
  const fingerprint = analysisFingerprint({
    body: content.body,
    profileVersionId: options.profileVersionId,
    ruleVersion: options.ruleVersion,
    modelRouteVersion: options.modelRouteVersion,
    promptVersion: analysisPromptVersion,
  })
  const existing = repository.getAnalysisByFingerprint(content.id, fingerprint)
  if (existing && !options.manual) return existing

  const startedAt = new Date().toISOString()
  const callId = `analysis-call-${randomUUID()}`
  const rawRecordId = `analysis-model-${callId}`
  const request = {
    title: content.title,
    body: content.body,
    profile: options.profile,
  }
  const auditedRequest = options.modelGateway.auditInput(request)
  await repository.saveRawResponse({
    id: rawRecordId,
    providerId: options.modelGateway.provider,
    receivedAt: startedAt,
    payload: { request: auditedRequest, status: 'started' },
  })
  try {
    const { result, evidence, rawResponse } =
      await options.modelGateway.analyze(request)
    await repository.saveRawResponse({
      id: rawRecordId,
      providerId: evidence.provider,
      receivedAt: new Date().toISOString(),
      payload: { request: auditedRequest, response: rawResponse ?? result },
    })
    const scored = calculateRecommendation(result)
    const analysisId = `analysis-${randomUUID()}`
    const analysis = await repository.saveAnalysis({
      id: analysisId,
      contentId: content.id,
      fingerprint,
      version: repository.nextAnalysisVersion(content.id),
      manual: options.manual,
      provider: evidence.provider,
      model: evidence.model,
      promptVersion: analysisPromptVersion,
      profileVersionId: options.profileVersionId,
      ruleVersion: options.ruleVersion,
      createdAt: new Date().toISOString(),
      durationMs: evidence.durationMs,
      usage: evidence.usage,
      result: { ...result, ...scored },
    })
    await repository.saveAnalysisCall({
      id: callId,
      contentId: content.id,
      analysisId,
      provider: evidence.provider,
      model: evidence.model,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: evidence.durationMs,
      status: 'succeeded',
      usage: evidence.usage,
    })
    return analysis
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const evidence =
      error instanceof ModelGatewayError ? error.evidence : undefined
    await repository.saveRawResponse({
      id: rawRecordId,
      providerId: evidence?.provider ?? options.modelGateway.provider,
      receivedAt: finishedAt,
      payload: {
        request: auditedRequest,
        ...(error instanceof ModelGatewayError &&
        error.rawResponse !== undefined
          ? { response: error.rawResponse }
          : {}),
        error: error instanceof Error ? error.message : String(error),
      },
    })
    await repository.saveAnalysisCall({
      id: callId,
      contentId: content.id,
      provider: evidence?.provider ?? options.modelGateway.provider,
      model: evidence?.model ?? options.modelGateway.model,
      startedAt,
      finishedAt,
      durationMs:
        evidence?.durationMs ??
        Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      status: 'failed',
      usage: evidence?.usage,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export interface RssPipelineOptions {
  repository: RuntimeRepository
  source: { id: string; feedUrl: string }
  fetcher?: Fetcher
  modelGateway: ModelGateway
  profile: string
  profileVersionId: string
  ruleVersion: string
  modelRouteVersion: string
  limit: number
  cursor?: string
  manualReanalysisContentId?: string
  now?: Date
}

async function canonicalContentAfterEnrichment(
  repository: RuntimeRepository,
  originalContentId: string,
  enriched: { body: string; canonicalUrl: string }
) {
  const canonicalId = contentId(enriched.canonicalUrl)
  return repository.mergeContentIdentity(
    originalContentId,
    canonicalId,
    enriched
  )
}

export async function runRssPipeline(options: RssPipelineOptions): Promise<{
  discovered: number
  succeeded: number
  failed: number
  analyses: AnalysisRecord[]
}> {
  if (options.manualReanalysisContentId) {
    const analysis = await analyzeStoredContent(
      options.repository,
      options.manualReanalysisContentId,
      {
        ...options,
        manual: true,
      }
    )
    return { discovered: 0, succeeded: 1, failed: 0, analyses: [analysis] }
  }

  const storedProgress = options.repository.getProgress(options.source.id)
  const cursor = options.cursor ?? storedProgress?.cursor
  const baselineExternalIds = new Set(storedProgress?.baselineExternalIds ?? [])
  const startedAt = new Date().toISOString()
  const adapter = new RssAdapter(options.fetcher)
  const batch = await adapter.discover({
    feedUrl: options.source.feedUrl,
    cursor,
    limit: options.limit,
    now: options.now,
    incremental: Boolean(storedProgress || options.cursor),
    isSeen: (externalId) => {
      const discovery = options.repository.getDiscovery(
        discoveryId(options.source.id, externalId)
      )
      if (discovery) {
        const content = options.repository.getContent(discovery.contentId)
        return Boolean(
          content?.body.trim() &&
          content.enrichmentStatus === 'succeeded' &&
          options.repository.listAnalyses(content.id).length > 0
        )
      }
      return baselineExternalIds.has(externalId)
    },
    isHistoricalRetry: (externalId) => {
      const discovery = options.repository.getDiscovery(
        discoveryId(options.source.id, externalId)
      )
      if (!discovery) return false
      const content = options.repository.getContent(discovery.contentId)
      return (
        !content?.body.trim() ||
        content.enrichmentStatus !== 'succeeded' ||
        options.repository.listAnalyses(content.id).length === 0
      )
    },
  })
  await options.repository.saveRawResponse({
    id: `rss-${options.source.id}-${randomUUID()}`,
    providerId: 'native-rss',
    receivedAt: new Date().toISOString(),
    payload: { xml: batch.rawResponse },
  })
  await options.repository.commitDiscoveryBatch({
    sourceId: options.source.id,
    baselineExternalIds: storedProgress ? undefined : batch.observedExternalIds,
    contents: batch.items.map((item) => ({
      id: contentId(item.canonicalUrl),
      title: item.title,
      body: '',
      canonicalUrl: item.canonicalUrl,
      sourceId: options.source.id,
      externalId: item.externalId,
      publishedAt: item.publishedAt,
      discoveredAt: new Date().toISOString(),
      enrichmentStatus: 'pending',
    })),
    discoveries: batch.items.map((item) => ({
      id: discoveryId(options.source.id, item.externalId),
      sourceId: options.source.id,
      contentId: contentId(item.canonicalUrl),
      discoveredAt: new Date().toISOString(),
    })),
  })

  const analyses: AnalysisRecord[] = []
  let failed = 0
  for (const item of batch.items) {
    const id = contentId(item.canonicalUrl)
    try {
      let content = options.repository.getContent(id)
      if (!content) throw new Error(`Discovered content is missing: ${id}`)
      if (!content.body.trim() || content.enrichmentStatus !== 'succeeded') {
        const enriched = await enrichArticle(item.canonicalUrl, options.fetcher)
        content = await canonicalContentAfterEnrichment(
          options.repository,
          id,
          enriched
        )
      } else if (content.canonicalUrl) {
        content =
          options.repository.getContent(contentId(content.canonicalUrl)) ??
          content
      }
      analyses.push(
        await analyzeStoredContent(options.repository, content.id, {
          ...options,
          manual: false,
        })
      )
    } catch (error) {
      failed += 1
      const content = options.repository.getContent(id)
      if (content && content.enrichmentStatus !== 'succeeded') {
        await options.repository.failContentEnrichment(
          id,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  }
  const advancedCursor = failed === 0 ? batch.nextCursor : cursor
  if (failed === 0 && batch.nextCursor) {
    await options.repository.advanceProgress(
      options.source.id,
      batch.nextCursor
    )
  }
  const finishedAt = new Date().toISOString()
  await options.repository.saveAudit({
    id: `rss-audit-${randomUUID()}`,
    sourceId: options.source.id,
    providerId: 'native-rss',
    startedAt,
    finishedAt,
    succeeded: analyses.length,
    failed,
    cursorBefore: cursor,
    cursorAfter: advancedCursor,
    retries: 0,
  })
  return {
    discovered: batch.items.length,
    succeeded: analyses.length,
    failed,
    analyses,
  }
}
