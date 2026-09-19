import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'

const level = z.number().int().min(1).max(5)
const dimensions = [
  'interest_fit',
  'concrete_gain',
  'substance',
  'new_information',
] as const
const weights = z.object(
  Object.fromEntries(
    dimensions.map((name) => [name, z.number().min(0).max(100)])
  ) as Record<(typeof dimensions)[number], z.ZodNumber>
)

export const analysisConfigSchema = z.object({
  model: z.object({ provider: z.string().min(1), name: z.string().min(1) }),
  prompts: z.object({
    classify: z.number().int().positive(),
    score: z.number().int().positive(),
    translate: z.number().int().positive(),
  }),
  translation: z.object({
    minimum_total_score: z.number().int().min(0).max(100),
  }),
  summarization: z.object({
    long_content_min_chars: z.number().int().positive(),
  }),
  scoring: z.object({
    weights: weights.refine(
      (value) => Object.values(value).reduce((a, b) => a + b, 0) === 100,
      'Weights must total 100'
    ),
    core_threshold: z.number().int().min(0).max(100),
    explore_threshold: z.number().int().min(0).max(100),
    core_min_levels: z.object({
      interest_fit: level,
      concrete_gain: level,
      substance: level,
    }),
    explore_min_levels: z.object({
      interest_fit: level,
      concrete_gain: level,
      substance: level,
    }),
  }),
})

export const profileConfigSchema = z.object({
  version: z.number().int().positive(),
  interests: z.array(z.string().min(1)).min(1),
  goals: z.array(z.string().min(1)).min(1),
  exclusions: z.array(z.string().min(1)),
})

export const runtimeConfigSchema = z.object({
  timezone: z.literal('Asia/Shanghai'),
  collection: z.object({
    schedule: z.string().min(1),
    list_pages: z.literal(1),
    max_retries: z.number().int().min(0).max(10),
    serial_sources: z.literal(true),
  }),
})

export const sourcesConfigSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/u),
      platform: z.enum(['x', 'youtube', 'rss']),
      account_name: z.string().min(1),
      external_identity: z.string().min(1),
      language: z.enum(['zh', 'en']),
      enabled: z.boolean(),
    })
  ),
})

export const retentionConfigSchema = z.object({
  junk: z.object({
    delete_after_days: z.number().int().nonnegative(),
    automatic_delete: z.boolean(),
  }),
})

export const providersConfigSchema = z.object({
  platforms: z.object({
    x: z.object({ preferred: z.enum(['twitterapi.io', 'tikhub-x']) }),
    youtube: z.object({
      preferred: z.enum(['youtube-data-api', 'tikhub-youtube']),
    }),
    rss: z.object({ preferred: z.literal('native-rss') }),
  }),
})

export const singleTableConfigFileNames = [
  'sources.yaml',
  'providers.yaml',
  'runtime.yaml',
  'analysis.yaml',
  'profile.yaml',
  'retention.yaml',
] as const

export const editableConfigFileNames = [
  'providers.yaml',
  'runtime.yaml',
  'analysis.yaml',
  'profile.yaml',
  'retention.yaml',
] as const

type SingleTableConfigFileName = (typeof singleTableConfigFileNames)[number]
export type EditableConfigFileName = (typeof editableConfigFileNames)[number]

const configSchemas = {
  'sources.yaml': sourcesConfigSchema,
  'providers.yaml': providersConfigSchema,
  'runtime.yaml': runtimeConfigSchema,
  'analysis.yaml': analysisConfigSchema,
  'profile.yaml': profileConfigSchema,
  'retention.yaml': retentionConfigSchema,
} as const

async function parseFile<T extends z.ZodType>(
  file: string,
  schema: T
): Promise<z.output<T>> {
  return schema.parse(parseYaml(await readFile(file, 'utf8')))
}

export async function loadSingleTableConfig(configRoot: string) {
  const [analysis, profile, runtime, sources, retention, providers] =
    await Promise.all([
      parseFile(path.join(configRoot, 'analysis.yaml'), analysisConfigSchema),
      parseFile(path.join(configRoot, 'profile.yaml'), profileConfigSchema),
      parseFile(path.join(configRoot, 'runtime.yaml'), runtimeConfigSchema),
      parseFile(path.join(configRoot, 'sources.yaml'), sourcesConfigSchema),
      parseFile(path.join(configRoot, 'retention.yaml'), retentionConfigSchema),
      parseFile(path.join(configRoot, 'providers.yaml'), providersConfigSchema),
    ])
  const ids = sources.sources.map((source) => source.id)
  if (new Set(ids).size !== ids.length)
    throw new Error('Duplicate source ID in sources.yaml')
  return { analysis, profile, runtime, sources, retention, providers }
}

export type SingleTableConfig = Awaited<
  ReturnType<typeof loadSingleTableConfig>
>

export async function initializeSingleTableConfig(
  templateRoot: string,
  dataRoot: string
): Promise<string> {
  const configRoot = path.join(dataRoot, 'config')
  await mkdir(configRoot, { recursive: true })
  for (const name of singleTableConfigFileNames) {
    try {
      await copyFile(
        path.join(templateRoot, name),
        path.join(configRoot, name),
        constants.COPYFILE_EXCL
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  for (const name of ['runtime.yaml', 'sources.yaml'] as const) {
    const target = path.join(configRoot, name)
    const content = await readFile(target, 'utf8')
    const migrated = content.replace(
      /^[\t ]+per_source_limit:[^\r\n]*(?:\r?\n|$)/gmu,
      ''
    )
    if (migrated !== content) await saveConfigFile(configRoot, name, migrated)
  }
  return configRoot
}

function validateConfigFile(
  name: SingleTableConfigFileName,
  content: string
): unknown {
  const value = configSchemas[name].parse(parseYaml(content))
  if (name === 'sources.yaml') {
    const ids = (value as z.output<typeof sourcesConfigSchema>).sources.map(
      (source) => source.id
    )
    if (new Set(ids).size !== ids.length)
      throw new Error('Duplicate source ID in sources.yaml')
  }
  return value
}

export function validateEditableConfigFile(
  name: EditableConfigFileName,
  content: string
): unknown {
  return validateConfigFile(name, content)
}

async function saveConfigFile(
  configRoot: string,
  name: SingleTableConfigFileName,
  content: string
): Promise<void> {
  validateConfigFile(name, content)
  const target = path.join(configRoot, name)
  const temporary = `${target}.${randomUUID()}.tmp`
  await writeFile(
    temporary,
    content.endsWith('\n') ? content : `${content}\n`,
    {
      flag: 'wx',
      mode: 0o600,
    }
  )
  await rename(temporary, target)
}

export async function saveEditableConfigFile(
  configRoot: string,
  name: EditableConfigFileName,
  content: string
): Promise<void> {
  await saveConfigFile(configRoot, name, content)
}

export async function saveSourcesConfig(
  configRoot: string,
  sources: z.output<typeof sourcesConfigSchema>['sources']
): Promise<void> {
  await saveConfigFile(configRoot, 'sources.yaml', stringifyYaml({ sources }))
}

export async function saveProvidersConfig(
  configRoot: string,
  providers: z.output<typeof providersConfigSchema>
): Promise<void> {
  await saveEditableConfigFile(
    configRoot,
    'providers.yaml',
    stringifyYaml(providers)
  )
}

export interface SourceState {
  sources: Record<
    string,
    {
      last_seen_content_id?: string
      last_collected_at?: string
      enabled_override?: boolean | null
    }
  >
}

export async function loadSourceState(
  configRoot: string
): Promise<SourceState> {
  const file = path.join(configRoot, 'local', 'source-state.yaml')
  try {
    const parsed = parseYaml(await readFile(file, 'utf8')) as unknown
    return z
      .object({
        sources: z.record(
          z.string(),
          z.object({
            last_seen_content_id: z.string().optional(),
            last_collected_at: z.iso.datetime().optional(),
            enabled_override: z.boolean().nullable().optional(),
          })
        ),
      })
      .parse(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { sources: {} }
    throw error
  }
}

export async function saveSourceState(
  configRoot: string,
  state: SourceState
): Promise<void> {
  const directory = path.join(configRoot, 'local')
  await mkdir(directory, { recursive: true })
  const target = path.join(directory, 'source-state.yaml')
  const temporary = `${target}.${randomUUID()}.tmp`
  await writeFile(temporary, stringifyYaml(state), { flag: 'wx', mode: 0o600 })
  await rename(temporary, target)
}
