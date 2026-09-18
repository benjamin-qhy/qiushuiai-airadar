import { homedir } from 'node:os'
import path from 'node:path'

import {
  createFileSecretReader,
  initializeSingleTableConfig,
  loadSingleTableConfig,
  loadSourceState,
  saveSourceState,
} from '../packages/config/src/index.js'
import {
  collectSourcesSerially,
  createSingleTableCodexGateway,
} from '../packages/pipeline/src/index.js'
import { SingleTableRepository } from '../packages/runtime/src/index.js'
import { createSingleTableSourceProvider } from '../apps/service/src/single-table-provider.js'

const dataRootValue = process.env.AIRADAR_V2_DATA_ROOT
if (!dataRootValue || !path.isAbsolute(dataRootValue))
  throw new Error(
    'AIRADAR_V2_DATA_ROOT must be an absolute path to a new data directory'
  )
const dataRoot = path.resolve(dataRootValue)
const legacyRoot = path.resolve(
  process.env.AIRADAR_DATA_ROOT ?? path.join(homedir(), '.airadar', 'data')
)
if (
  dataRoot === legacyRoot ||
  dataRoot.startsWith(`${legacyRoot}${path.sep}`) ||
  legacyRoot.startsWith(`${dataRoot}${path.sep}`)
)
  throw new Error('New data root must not overlap the legacy data directory')

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const configRoot = await initializeSingleTableConfig(
  path.join(repositoryRoot, 'config'),
  dataRoot
)
const config = await loadSingleTableConfig(configRoot)
const sourceState = await loadSourceState(configRoot)
const secretReader = createFileSecretReader(
  process.env.AIRADAR_V2_SECRET_FILE ?? path.join(dataRoot, '.env')
)
async function secret(name: string): Promise<string | undefined> {
  return secretReader.get(name).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  })
}
const [tikHubToken, twitterApiKey, youtubeApiKey, codexAuthPath] =
  await Promise.all([
    secret('TIKHUB_API_KEY'),
    secret('TWITTERAPI_IO_KEY'),
    secret('YOUTUBE_API_KEY'),
    secret('CODEX_AUTH_PATH'),
  ])
const gateway = createSingleTableCodexGateway(
  codexAuthPath ?? path.join(homedir(), '.codex', 'auth.json'),
  config.analysis.model.name
)
const provider = createSingleTableSourceProvider({
  tikHubToken,
  twitterApiKey,
  youtubeApiKey,
})
const repository = await SingleTableRepository.open(dataRoot)
try {
  const results = await collectSourcesSerially({
    repository,
    provider,
    gateway,
    sources: config.sources.sources.map((source) => ({
      ...source,
      enabled:
        sourceState.sources[source.id]?.enabled_override ?? source.enabled,
    })),
    promptsRoot: path.join(
      repositoryRoot,
      'docs',
      'prompts',
      'single-table-content'
    ),
    profile: config.profile,
    profileVersion: String(config.profile.version),
    scoring: {
      weights: config.analysis.scoring.weights,
      coreThreshold: config.analysis.scoring.core_threshold,
      exploreThreshold: config.analysis.scoring.explore_threshold,
      coreMinLevels: config.analysis.scoring.core_min_levels,
      exploreMinLevels: config.analysis.scoring.explore_min_levels,
    },
    longContentMinChars: config.analysis.summarization.long_content_min_chars,
    translationMinimumTotalScore:
      config.analysis.translation.minimum_total_score,
    perSourceLimit: config.runtime.collection.per_source_limit,
    onError(source, item) {
      process.stderr.write(
        `Source ${source.id}, item ${item?.externalId ?? 'list'} failed; see content log if created.\n`
      )
    },
    async afterSource(source, result, page) {
      if (result.failed) return
      sourceState.sources[source.id] = {
        ...sourceState.sources[source.id],
        last_seen_content_id:
          page.items[0]?.externalId ??
          sourceState.sources[source.id]?.last_seen_content_id,
        last_collected_at: new Date().toISOString(),
      }
      await saveSourceState(configRoot, sourceState)
    },
  })
  process.stdout.write(`${JSON.stringify(results)}\n`)
  if (results.some((result) => result.failed)) process.exitCode = 1
} finally {
  repository.close()
}
