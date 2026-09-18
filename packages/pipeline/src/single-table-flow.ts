import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { createModels } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

import type {
  SingleTableRepository,
  ContentRow,
  LogEvent,
  OriginalContent,
  ScoreDimension,
  ScoringRules,
} from '@airadar/runtime'
import { createReadOnlyCodexCredentialStore } from './index.js'

const promptNames = {
  classify: '01-中文总结与内容判定.md',
  score: '02-内容分析与评分.md',
  translate: '03-英文内容意译.md',
} as const

const classificationSchema = z.object({
  keywords: z.array(z.string().trim().min(1)).min(1).max(5),
  spam: z.object({ isJunk: z.boolean(), reason: z.string().nullable() }),
})
const scoreSchema = z.object({
  level: z.number().int().min(1).max(5),
  reason: z.string().trim().min(1),
})
const scoringSchema = z.object({
  valueSummary: z.string().trim().min(1),
  scores: z.object({
    interestFit: scoreSchema,
    concreteGain: scoreSchema,
    substance: scoreSchema,
    newInformation: scoreSchema,
  }),
})
const translationSchema = z.object({
  chineseTitle: z.string().trim().min(1).nullable(),
  chineseBody: z.string().trim().min(1),
})

export interface SingleTableModelResponse {
  text: string
  request?: unknown
  response?: unknown
  provider: string
  model: string
  durationMs: number
}

export interface SingleTableModelGateway {
  complete(input: {
    system: string
    user: string
    stage: keyof typeof promptNames
  }): Promise<SingleTableModelResponse>
}

export function createSingleTableCodexGateway(
  authPath: string,
  modelId: string
): SingleTableModelGateway {
  const models = createModels({
    credentials: createReadOnlyCodexCredentialStore(authPath),
  })
  models.setProvider(openaiCodexProvider())
  const model = models.getModel('openai-codex', modelId)
  if (!model) throw new Error(`Codex model is unavailable: ${modelId}`)
  return {
    async complete(input) {
      const request = {
        context: {
          systemPrompt: input.system,
          messages: [
            { role: 'user' as const, content: input.user, timestamp: 0 },
          ],
        },
        options: {
          reasoning: 'low' as const,
          maxTokens:
            input.stage === 'translate'
              ? 32_000
              : input.stage === 'classify'
                ? 8_000
                : 4_000,
          maxRetries: 0,
        },
      }
      const started = Date.now()
      const message = await models.completeSimple(
        model,
        request.context,
        request.options
      )
      const response = {
        provider: message.provider,
        model: message.model,
        stopReason: message.stopReason,
        errorMessage: message.errorMessage,
        // Internal reasoning payloads and signatures are not user-facing
        // response content and must never be persisted to Markdown logs.
        content: message.content
          .filter((block) => block.type === 'text')
          .map((block) => ({ type: 'text', text: block.text })),
        omittedNonTextBlocks: message.content.filter(
          (block) => block.type !== 'text'
        ).length,
        usage: message.usage,
      }
      if (message.stopReason === 'error') {
        const error = new Error(
          message.errorMessage || 'Model request failed'
        ) as Error & { response: unknown }
        error.response = response
        throw error
      }
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
      if (!text) {
        const error = new Error('Model returned no text') as Error & {
          response: unknown
        }
        error.response = response
        throw error
      }
      return {
        text,
        request,
        response,
        provider: message.provider,
        model: message.model,
        durationMs: Date.now() - started,
      }
    },
  }
}

export interface ContentFlowOptions {
  repository: SingleTableRepository
  gateway: SingleTableModelGateway
  promptsRoot: string
  original: OriginalContent
  profile: { interests: string[]; goals: string[]; exclusions: string[] }
  profileVersion?: string
  scoring: ScoringRules
  longContentMinChars: number
  translationMinimumTotalScore: number
  capturedCalls?: LogEvent[]
}

function getMarkdownSection(
  markdown: string,
  name: string,
  next: string
): string {
  const start = markdown.indexOf(`## ${name}\n`)
  const end = markdown.indexOf(`## ${next}\n`, start + 3)
  if (start < 0 || end < 0) throw new Error(`Prompt section missing: ${name}`)
  return markdown.slice(start + name.length + 4, end).trim()
}

function promptTemplate(markdown: string): string {
  const section = getMarkdownSection(
    markdown,
    '发给模型的用户提示词模板',
    '输出与写入'
  )
  const match = /```text\n([\s\S]*?)\n```/u.exec(section)
  if (!match) throw new Error('User prompt template is missing')
  return match[1]!
}

function render(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/gu, (_, name: string) => {
    if (!(name in variables))
      throw new Error(`Prompt variable missing: ${name}`)
    return variables[name]!
  })
}

function parseFrontmatter(markdown: string): {
  attributes: unknown
  body: string
} {
  const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u.exec(markdown.trim())
  if (!match) throw new Error('Model response has no YAML front matter')
  return {
    attributes: parseYaml(match[1]!),
    body: markdown.trim().slice(match[0].length).trim(),
  }
}

function longMode(original: OriginalContent, minimum: number): boolean {
  return (
    original.explicitLong === true ||
    original.kind === 'article' ||
    original.format === 'subtitle' ||
    (original.kind !== 'short_post' && original.body.length >= minimum) ||
    original.body.length >= minimum
  )
}

function modelResponse(error: unknown): unknown {
  if (error && typeof error === 'object' && 'response' in error)
    return (error as { response: unknown }).response
  return {
    received: false,
    errorType: error instanceof Error ? error.name : 'unknown',
  }
}

async function call<T>(
  options: ContentFlowOptions,
  row: ContentRow,
  stage: keyof typeof promptNames,
  variables: Record<string, string>,
  validate: (text: string) => T
): Promise<{ value: T; metadata: SingleTableModelResponse }> {
  const name = promptNames[stage]
  const prompt = await readFile(path.join(options.promptsRoot, name), 'utf8')
  const system = getMarkdownSection(
    prompt,
    '发给模型的系统提示词',
    '发给模型的用户提示词模板'
  )
  const user = render(promptTemplate(prompt), variables)
  const request = { stage, system, user }
  const started = Date.now()
  let received: SingleTableModelResponse | undefined
  try {
    received = await options.gateway.complete({ stage, system, user })
    const parsed = validate(received.text)
    await options.repository.appendLog(row.id, {
      action: stage,
      stage:
        stage === 'classify'
          ? 'classifying'
          : stage === 'score'
            ? 'scoring'
            : 'translating',
      status: 'succeeded',
      durationMs: received.durationMs,
      processor: `${received.provider}/${received.model}`,
      prompt: name,
      request: received.request ?? request,
      response: received.response ?? { text: received.text },
    })
    return { value: parsed, metadata: received }
  } catch (error) {
    options.repository.fail(row.id, stage, error)
    await options.repository.appendLog(row.id, {
      action: stage,
      stage,
      status: 'failed',
      durationMs: Date.now() - started,
      prompt: name,
      request: received?.request ?? request,
      response:
        received?.response ??
        (received ? { text: received.text } : modelResponse(error)),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function processSingleTableContent(
  options: ContentFlowOptions
): Promise<ContentRow> {
  const original = options.original
  const row = await options.repository.saveOriginal(original)
  for (const event of options.capturedCalls ?? [])
    await options.repository.appendLog(row.id, event)
  const variables = {
    original_title_or_none: original.originalTitle ?? '无',
    source_platform: original.platform,
    source_account_name: original.sourceAccountName,
    content_kind: original.kind,
    original_language: original.language,
    original_body_or_transcript: original.body,
    profile_exclusions: options.profile.exclusions.join('；'),
    profile_interests_and_goals: [
      ...options.profile.interests,
      ...options.profile.goals,
    ].join('；'),
    scoring_dimensions: [
      ['兴趣匹配', options.scoring.weights.interest_fit],
      ['具体收获', options.scoring.weights.concrete_gain],
      ['内容扎实度', options.scoring.weights.substance],
      ['新信息', options.scoring.weights.new_information],
    ]
      .map(([name, weight]) => `${name} ${weight}%`)
      .join('；'),
    source_format: original.format,
    subtitle_segments_or_none:
      original.format === 'subtitle' ? original.body : '无',
    english_body: original.body,
  }
  const isLong = longMode(original, options.longContentMinChars)
  const { value: classified } = await call(
    options,
    row,
    'classify',
    {
      ...variables,
      summary_mode: isLong ? 'long' : 'short',
    },
    (text) => {
      const parsed = parseFrontmatter(text)
      const attributes = classificationSchema.parse(parsed.attributes)
      if (isLong && !parsed.body)
        throw new Error('Long content summary is missing')
      return { ...attributes, body: parsed.body }
    }
  )
  const afterClassification = await options.repository.saveClassification(
    row.id,
    {
      keywords: classified.keywords,
      isJunk: classified.spam.isJunk,
      reason: classified.spam.reason ?? undefined,
      summary: isLong ? classified.body : undefined,
    }
  )
  if (afterClassification.is_junk) return afterClassification

  // The second call receives only original source content and profile, never
  // the first call's summary or keywords.
  const analysisCall = await call(options, row, 'score', variables, (text) =>
    scoringSchema.parse(JSON.parse(text))
  )
  const analysis = analysisCall.value
  const scores: Record<ScoreDimension, { level: number; reason: string }> = {
    interest_fit: analysis.scores.interestFit,
    concrete_gain: analysis.scores.concreteGain,
    substance: analysis.scores.substance,
    new_information: analysis.scores.newInformation,
  }
  const scored = await options.repository.saveScoring(
    row.id,
    analysis.valueSummary,
    scores,
    options.scoring,
    {
      provider: analysisCall.metadata.provider,
      model: analysisCall.metadata.model,
      promptVersion: '3',
      profileVersion: options.profileVersion ?? '1',
      durationMs: analysisCall.metadata.durationMs,
    }
  )
  if (
    original.language !== 'en' ||
    scored.total_score === null ||
    scored.total_score < options.translationMinimumTotalScore
  )
    return scored

  const translationCall = await call(
    options,
    row,
    'translate',
    variables,
    (text) => translationSchema.parse(JSON.parse(text))
  )
  return options.repository.saveTranslation(
    row.id,
    translationCall.value.chineseBody,
    translationCall.value.chineseTitle,
    options.translationMinimumTotalScore,
    {
      provider: translationCall.metadata.provider,
      model: translationCall.metadata.model,
    }
  )
}
